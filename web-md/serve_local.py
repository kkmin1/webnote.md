from __future__ import annotations

import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8080"))
ROOT_DIR = Path(__file__).resolve().parent.parent


def safe_user_path(raw: str | None) -> Path | None:
    if not raw:
        return None
    text = raw.strip()
    if not text:
        return None

    candidate = Path(text)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / text.lstrip("\\/")

    try:
        resolved = candidate.resolve()
    except OSError:
        return None

    try:
        resolved.relative_to(ROOT_DIR)
    except ValueError:
        return None
    return resolved


def resolve_asset_path(doc_path: Path, source: str) -> Path | None:
    source = (source or "").strip()
    if not source:
        return None

    direct_path = safe_user_path(source)
    if direct_path and direct_path.is_file():
        return direct_path

    doc_dir = doc_path.parent
    candidate = (doc_dir / source).resolve()
    try:
        candidate.relative_to(doc_dir)
    except ValueError:
        candidate = None

    if candidate and candidate.is_file():
        return candidate

    normalized = source.replace("\\", "/").lstrip("./").lstrip("/").lower()
    basename = Path(normalized).name

    suffix_match = None
    basename_match = None
    for file_path in doc_dir.rglob("*"):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(doc_dir).as_posix().lower()
        if normalized and rel.endswith(normalized):
            suffix_match = file_path
            break
        if basename and file_path.name.lower() == basename and basename_match is None:
            basename_match = file_path

    return suffix_match or basename_match


class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/document":
            self.handle_document(parsed)
            return
        if parsed.path == "/api/asset":
            self.handle_asset(parsed)
            return
        super().do_GET()

    def handle_document(self, parsed) -> None:
        params = parse_qs(parsed.query)
        file_path = safe_user_path(params.get("path", [None])[0])
        if file_path is None:
            self.send_json(400, {"error": "Invalid path"})
            return
        if not file_path.is_file():
            self.send_json(404, {"error": "Document not found"})
            return

        try:
            content = file_path.read_text(encoding="utf-8")
        except OSError as exc:
            self.send_json(500, {"error": str(exc)})
            return

        self.send_json(
            200,
            {
                "content": content,
                "name": file_path.name,
                "path": str(file_path),
                "type": "svg" if file_path.suffix.lower() == ".svg" else "markdown",
            },
        )

    def handle_asset(self, parsed) -> None:
        params = parse_qs(parsed.query)
        doc_path = safe_user_path(params.get("doc", [None])[0])
        source = params.get("src", [None])[0]
        if doc_path is None or source is None:
            self.send_error(400, "Invalid asset request")
            return
        if not doc_path.is_file():
            self.send_error(404, "Document not found")
            return

        asset_path = resolve_asset_path(doc_path, source)
        if asset_path is None or not asset_path.is_file():
            self.send_error(404, "Asset not found")
            return

        try:
            data = asset_path.read_bytes()
        except OSError as exc:
            self.send_error(500, str(exc))
            return

        mime_type, _ = mimetypes.guess_type(str(asset_path))
        self.send_response(200)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    with ThreadingHTTPServer((HOST, PORT), LocalHandler) as server:
        viewer = f"http://{HOST}:{PORT}/web-md/index.html"
        example = f"{viewer}"
        print(f"Serving {ROOT_DIR}")
        print(f"Viewer:  {viewer}")
        print(f"Local mode: use 파일 선택 and enter a scratch path like /converter/glm.md")
        print(f"Example: {example}")
        server.serve_forever()
