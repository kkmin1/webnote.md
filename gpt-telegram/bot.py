#!/usr/bin/env python3
"""Minimal Telegram bot that bridges chat, local workspace actions, and Codex CLI."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from urllib import parse, request


ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / ".bot_state.json"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def optional_int(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    return int(value)


def get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 60) -> Any:
    req = request.Request(url, headers=headers or {})
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None, timeout: int = 120) -> Any:
    raw = json.dumps(payload).encode("utf-8")
    merged_headers = {"Content-Type": "application/json"}
    if headers:
        merged_headers.update(headers)
    req = request.Request(url, data=raw, headers=merged_headers, method="POST")
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_telegram_message(token: str, chat_id: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text[:4000],
        "disable_web_page_preview": True,
    }
    post_json(url, payload, timeout=60)


def send_telegram_chat_action(token: str, chat_id: int, action: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendChatAction"
    payload = {
        "chat_id": chat_id,
        "action": action,
    }
    post_json(url, payload, timeout=30)


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"update_offset": 0, "codex_threads": {}}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"update_offset": 0, "codex_threads": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def normalize_chat_id(value: int | str) -> str:
    return str(value).strip()


def safe_resolve(workspace_root: Path, raw_path: str) -> Path:
    candidate = (workspace_root / raw_path.strip()).resolve()
    try:
        candidate.relative_to(workspace_root)
    except ValueError as exc:
        raise ValueError("Path escapes WORKSPACE_ROOT") from exc
    return candidate


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return f"{text[:limit]}\n\n... truncated {omitted} chars ..."


class WorkspaceBot:
    def __init__(self) -> None:
        load_env_file(ROOT / ".env")
        self.telegram_token = require_env("TELEGRAM_BOT_TOKEN")
        self.allowed_chat_id = normalize_chat_id(require_env("ALLOWED_CHAT_ID"))
        self.workspace_root = Path(
            os.environ.get("WORKSPACE_ROOT", str(ROOT)).strip() or str(ROOT)
        ).resolve()
        self.model = os.environ.get("CODEX_MODEL", "gpt-5.4").strip() or "gpt-5.4"
        self.poll_timeout = optional_int("POLL_TIMEOUT_SECONDS", 30)
        self.command_timeout = optional_int("COMMAND_TIMEOUT_SECONDS", 120)
        self.codex_timeout = optional_int("CODEX_TIMEOUT_SECONDS", 900)
        self.max_file_chars = optional_int("MAX_FILE_CHARS", 24000)
        self.max_output_chars = optional_int("MAX_OUTPUT_CHARS", 12000)
        self.state = load_state()
        self.state_lock = threading.Lock()
        self.busy_chats: set[str] = set()
        self.busy_lock = threading.Lock()
        self.codex_executable = self.resolve_codex_executable()

    def resolve_codex_executable(self) -> str:
        if os.name == "nt" and shutil.which("codex.cmd"):
            return "codex.cmd"
        return "codex"

    def run(self) -> None:
        print(f"workspace_root={self.workspace_root}")
        while True:
            try:
                self.poll_once()
            except KeyboardInterrupt:
                print("stopped")
                raise
            except Exception as exc:  # pragma: no cover - resilience path
                print(f"loop error: {exc}", file=sys.stderr)
                time.sleep(3)

    def poll_once(self) -> None:
        offset = int(self.state.get("update_offset", 0))
        params = parse.urlencode(
            {
                "timeout": self.poll_timeout,
                "offset": offset,
                "allowed_updates": json.dumps(["message"]),
            }
        )
        url = f"https://api.telegram.org/bot{self.telegram_token}/getUpdates?{params}"
        data = get_json(url, timeout=self.poll_timeout + 10)
        for update in data.get("result", []):
            with self.state_lock:
                self.state["update_offset"] = update["update_id"] + 1
                save_state(self.state)
            self.handle_update(update)

    def handle_update(self, update: dict[str, Any]) -> None:
        message = update.get("message", {})
        chat = message.get("chat", {})
        chat_id = normalize_chat_id(chat.get("id", ""))
        text = (message.get("text") or "").strip()
        if not text:
            return
        if chat_id != self.allowed_chat_id:
            try:
                send_telegram_message(
                    self.telegram_token,
                    int(chat.get("id")),
                    "This bot is locked to a different chat_id.",
                )
            except Exception:
                pass
            return

        reply = self.dispatch(chat_id, text)
        if reply:
            send_telegram_message(self.telegram_token, int(chat_id), reply)

    def dispatch(self, chat_id: str, text: str) -> str:
        if text.startswith("/help"):
            return self.help_text()
        if text.startswith("/ping"):
            return self.ping_text(chat_id)
        if text.startswith("/pwd"):
            return str(self.workspace_root)
        if text.startswith("/read "):
            return self.read_file(text[len("/read ") :])
        if text.startswith("/run "):
            return self.start_background_job(
                chat_id,
                lambda: self.run_command(text[len("/run ") :], label="run"),
            )
        if text.startswith("/test "):
            return self.start_background_job(
                chat_id,
                lambda: self.run_command(text[len("/test ") :], label="test"),
            )
        if text.startswith("/edit "):
            return self.start_background_job(
                chat_id,
                lambda: self.edit_file(chat_id, text[len("/edit ") :]),
            )
        if text.startswith("/reset"):
            with self.state_lock:
                self.state.setdefault("codex_threads", {}).pop(chat_id, None)
                save_state(self.state)
            return "Codex session cleared for this chat."
        if text.startswith("/"):
            return "Unknown command. Use /help."
        return self.start_background_job(chat_id, lambda: self.chat_with_codex(chat_id, text))

    def help_text(self) -> str:
        return (
            "Commands:\n"
            "/help - show commands\n"
            "/ping - show alive and busy status\n"
            "/pwd - show workspace root\n"
            "/read <path> - read a file inside WORKSPACE_ROOT\n"
            "/run <command> - run a shell command in WORKSPACE_ROOT\n"
            "/test <command> - run a test command in WORKSPACE_ROOT\n"
            "/edit <path> :: <instruction> - rewrite one file with Codex\n"
            "/reset - clear Codex session for this Telegram chat\n"
            "\n"
            "Any plain message is sent to the local Codex CLI as a normal coding chat."
        )

    def ping_text(self, chat_id: str) -> str:
        return f"alive / {self.chat_status(chat_id)}"

    def chat_status(self, chat_id: str) -> str:
        with self.busy_lock:
            if chat_id in self.busy_chats:
                return "busy"
        return "idle"

    def start_background_job(self, chat_id: str, job: Any) -> str:
        with self.busy_lock:
            if chat_id in self.busy_chats:
                return "이전 작업이 아직 실행 중입니다"
            self.busy_chats.add(chat_id)

        worker = threading.Thread(
            target=self.run_background_job,
            args=(chat_id, job),
            daemon=True,
        )
        worker.start()
        return "연결됨. 처리 시작합니다."

    def run_background_job(self, chat_id: str, job: Any) -> None:
        done = threading.Event()
        heartbeat = threading.Thread(
            target=self.send_typing_until_done,
            args=(int(chat_id), done),
            daemon=True,
        )
        heartbeat.start()
        try:
            reply = job()
        except Exception as exc:  # pragma: no cover - resilience path
            reply = f"작업 중 오류: {exc}"
        finally:
            done.set()
            with self.busy_lock:
                self.busy_chats.discard(chat_id)

        if reply:
            send_telegram_message(self.telegram_token, int(chat_id), reply)

    def send_typing_until_done(self, chat_id: int, done: threading.Event) -> None:
        while not done.is_set():
            try:
                send_telegram_chat_action(self.telegram_token, chat_id, "typing")
            except Exception:
                pass
            done.wait(4)

    def read_file(self, raw_path: str) -> str:
        try:
            path = safe_resolve(self.workspace_root, raw_path)
        except ValueError as exc:
            return f"read blocked: {exc}"
        if not path.exists():
            return f"not found: {path.relative_to(self.workspace_root)}"
        if path.is_dir():
            return f"is a directory: {path.relative_to(self.workspace_root)}"
        try:
            body = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return "binary or non-utf8 file; read skipped"
        header = f"# {path.relative_to(self.workspace_root)}\n"
        return truncate(header + body, self.max_output_chars)

    def run_command(self, command: str, label: str) -> str:
        command = command.strip()
        if not command:
            return f"{label} command is empty"
        try:
            result = subprocess.run(
                command,
                cwd=self.workspace_root,
                shell=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=self.command_timeout,
            )
        except subprocess.TimeoutExpired:
            return f"{label} timeout after {self.command_timeout}s"
        output = (result.stdout or "") + ("\n" if result.stdout and result.stderr else "") + (result.stderr or "")
        summary = [
            f"$ {command}",
            f"exit_code={result.returncode}",
            "",
            truncate(output.strip() or "(no output)", self.max_output_chars),
        ]
        return "\n".join(summary)

    def edit_file(self, chat_id: str, raw: str) -> str:
        if "::" not in raw:
            return "usage: /edit path/to/file :: instruction"
        raw_path, instruction = raw.split("::", 1)
        instruction = instruction.strip()
        if not instruction:
            return "edit instruction is empty"
        try:
            path = safe_resolve(self.workspace_root, raw_path)
        except ValueError as exc:
            return f"edit blocked: {exc}"
        if not path.exists():
            return "edit currently supports existing files only"
        if path.is_dir():
            return "edit target is a directory"
        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return "binary or non-utf8 file; edit skipped"
        if len(original) > self.max_file_chars:
            return f"file too large for /edit ({len(original)} chars > {self.max_file_chars})"

        prompt = (
            "You are editing exactly one file in a local coding workspace.\n"
            "Return only the complete updated file contents.\n"
            "Do not use markdown fences.\n"
            "Preserve language syntax and existing behavior except for the requested change.\n"
            f"Path: {path.relative_to(self.workspace_root)}\n\n"
            f"Instruction:\n{instruction}\n\n"
            "Original file:\n"
            f"{original}"
        )
        new_text, edit_error = self.codex_file_rewrite(prompt)
        if edit_error:
            return edit_error
        if new_text is None or not new_text.strip():
            return "Codex returned empty content; edit cancelled"
        path.write_text(new_text, encoding="utf-8")
        return f"updated {path.relative_to(self.workspace_root)} ({len(new_text)} chars)"

    def chat_with_codex(self, chat_id: str, text: str) -> str:
        reply, thread_id, err = self.codex_prompt(chat_id, text, store_history=True)
        if err and self.is_stale_thread_error(err):
            with self.state_lock:
                self.state.setdefault("codex_threads", {}).pop(chat_id, None)
                save_state(self.state)
            reply, thread_id, err = self.codex_prompt(chat_id, text, store_history=True)
        if err:
            return err
        if thread_id:
            with self.state_lock:
                self.state.setdefault("codex_threads", {})[chat_id] = thread_id
                save_state(self.state)
        return truncate(reply or "(no output)", self.max_output_chars)

    def is_stale_thread_error(self, err: str) -> bool:
        lowered = err.lower()
        return "thread/resume failed" in lowered and "no rollout found" in lowered

    def codex_file_rewrite(self, prompt: str) -> tuple[str | None, str | None]:
        reply, _, err = self.codex_prompt("file-rewrite", prompt, store_history=False)
        if err:
            return None, err
        return reply, None

    def codex_prompt(
        self, chat_id: str, prompt: str, store_history: bool
    ) -> tuple[str | None, str | None, str | None]:
        with tempfile.NamedTemporaryFile(
            prefix="codex-last-", suffix=".txt", delete=False
        ) as tmp:
            output_path = tmp.name

        thread_id = None
        try:
            cmd = self.build_codex_command(chat_id, prompt, output_path, store_history)
            result = subprocess.run(
                cmd,
                cwd=self.workspace_root,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=self.codex_timeout,
            )
            stdout = result.stdout or ""
            stderr = result.stderr or ""
            thread_id = self.extract_thread_id(stdout)

            if result.returncode != 0:
                detail = stdout.strip() or stderr.strip() or f"codex exit_code={result.returncode}"
                return None, thread_id, truncate(detail, self.max_output_chars)

            reply = ""
            output_file = Path(output_path)
            if output_file.exists():
                reply = output_file.read_text(encoding="utf-8").strip()
            if not reply:
                reply = self.extract_last_agent_message(stdout)
            return reply, thread_id, None
        except subprocess.TimeoutExpired:
            return None, thread_id, f"codex timeout after {self.codex_timeout}s"
        finally:
            try:
                Path(output_path).unlink(missing_ok=True)
            except OSError:
                pass

    def build_codex_command(
        self, chat_id: str, prompt: str, output_path: str, store_history: bool
    ) -> list[str]:
        base = [
            self.codex_executable,
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--sandbox",
            "workspace-write",
            "--color",
            "never",
            "--model",
            self.model,
            "--output-last-message",
            output_path,
        ]
        if store_history:
            with self.state_lock:
                thread_id = self.state.setdefault("codex_threads", {}).get(chat_id)
            if thread_id:
                return [
                    self.codex_executable,
                    "exec",
                    "resume",
                    "--json",
                    "--skip-git-repo-check",
                    "--model",
                    self.model,
                    "--output-last-message",
                    output_path,
                    thread_id,
                    prompt,
                ]
        return base + ["-C", str(self.workspace_root), prompt]

    def extract_thread_id(self, stdout: str) -> str | None:
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "thread.started":
                return payload.get("thread_id")
        return None

    def extract_last_agent_message(self, stdout: str) -> str:
        last_text = ""
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if payload.get("type") != "item.completed":
                continue
            item = payload.get("item", {})
            if item.get("type") == "agent_message":
                last_text = (item.get("text") or "").strip()
        return last_text


def main() -> int:
    try:
        bot = WorkspaceBot()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    bot.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
