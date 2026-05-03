from __future__ import annotations

import io
import secrets
import shutil
import subprocess
import zipfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory
from markitdown import MarkItDown
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "runs"
RUNS_DIR.mkdir(exist_ok=True)

ALLOWED_DOCX = {".docx"}
ALLOWED_MD = {".md", ".markdown"}
PANDOC_BIN = shutil.which("pandoc")

app = Flask(__name__)
markitdown = MarkItDown()


def make_job_dir(prefix: str) -> Path:
    job_dir = RUNS_DIR / f"{prefix}-{secrets.token_hex(4)}"
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def ensure_pandoc() -> None:
    if not PANDOC_BIN:
        raise RuntimeError("pandoc를 찾을 수 없습니다. PATH에 pandoc가 있어야 합니다.")


def allowed(filename: str, extensions: set[str]) -> bool:
    return Path(filename).suffix.lower() in extensions


def convert_docx_file_to_markdown(source_path: Path) -> str:
    result = markitdown.convert(str(source_path))
    text = getattr(result, "text_content", "") or ""
    if not text.strip():
        raise RuntimeError(f"{source_path.name} 변환 결과가 비어 있습니다.")
    return text


def convert_markdown_file_to_docx(source_path: Path, output_path: Path) -> None:
    ensure_pandoc()
    cmd = [PANDOC_BIN, str(source_path), "-f", "markdown", "-t", "docx", "-o", str(output_path)]
    completed = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "pandoc 변환에 실패했습니다.")


def build_zip(paths: list[Path]) -> io.BytesIO:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            zf.write(path, arcname=path.name)
    buffer.seek(0)
    return buffer


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/docx-to-md")
def api_docx_to_md():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "DOCX 파일을 하나 이상 선택해 주세요."}), 400

    job_dir = make_job_dir("docx-md")
    outputs: list[Path] = []
    items = []

    try:
        for uploaded in files:
            original_name = uploaded.filename or "input.docx"
            if not allowed(original_name, ALLOWED_DOCX):
                return jsonify({"error": f"DOCX만 업로드할 수 있습니다: {original_name}"}), 400

            safe_name = secure_filename(Path(original_name).name) or "input.docx"
            source_path = job_dir / safe_name
            uploaded.save(source_path)

            markdown = convert_docx_file_to_markdown(source_path)
            output_path = job_dir / f"{source_path.stem}.md"
            output_path.write_text(markdown, encoding="utf-8")
            outputs.append(output_path)
            items.append(
                {
                    "input_name": original_name,
                    "output_name": output_path.name,
                    "download_url": f"/download/{job_dir.name}/{output_path.name}",
                    "preview": markdown[:4000],
                }
            )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    archive_url = None
    if len(outputs) > 1:
        archive_url = f"/download-zip/{job_dir.name}/markdown.zip"

    return jsonify({"items": items, "archive_url": archive_url})


@app.post("/api/md-to-docx")
def api_md_to_docx():
    uploads = request.files.getlist("files")
    markdown_text = (request.form.get("markdown_text") or "").strip()
    filename = (request.form.get("filename") or "converted").strip()

    if not uploads and not markdown_text:
        return jsonify({"error": "Markdown 파일을 올리거나 직접 내용을 입력해 주세요."}), 400

    job_dir = make_job_dir("md-docx")
    outputs: list[Path] = []
    items = []

    try:
        if uploads:
            for uploaded in uploads:
                original_name = uploaded.filename or "input.md"
                if not allowed(original_name, ALLOWED_MD):
                    return jsonify({"error": f"Markdown 파일만 업로드할 수 있습니다: {original_name}"}), 400

                safe_name = secure_filename(Path(original_name).name) or "input.md"
                source_path = job_dir / safe_name
                uploaded.save(source_path)

                output_path = job_dir / f"{source_path.stem}.docx"
                convert_markdown_file_to_docx(source_path, output_path)
                outputs.append(output_path)
                items.append(
                    {
                        "input_name": original_name,
                        "output_name": output_path.name,
                        "download_url": f"/download/{job_dir.name}/{output_path.name}",
                    }
                )
        else:
            safe_stem = secure_filename(filename) or "converted"
            source_path = job_dir / f"{safe_stem}.md"
            source_path.write_text(markdown_text + "\n", encoding="utf-8")

            output_path = job_dir / f"{safe_stem}.docx"
            convert_markdown_file_to_docx(source_path, output_path)
            outputs.append(output_path)
            items.append(
                {
                    "input_name": source_path.name,
                    "output_name": output_path.name,
                    "download_url": f"/download/{job_dir.name}/{output_path.name}",
                }
            )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    archive_url = None
    if len(outputs) > 1:
        archive_url = f"/download-zip/{job_dir.name}/docx.zip"

    return jsonify({"items": items, "archive_url": archive_url})


@app.get("/download/<job_id>/<filename>")
def download_file(job_id: str, filename: str):
    return send_from_directory(RUNS_DIR / job_id, filename, as_attachment=True)


@app.get("/download-zip/<job_id>/<filename>")
def download_zip(job_id: str, filename: str):
    job_dir = RUNS_DIR / job_id
    if filename == "markdown.zip":
        paths = sorted(job_dir.glob("*.md"))
    elif filename == "docx.zip":
        paths = sorted(job_dir.glob("*.docx"))
    else:
        return jsonify({"error": "알 수 없는 묶음 파일입니다."}), 404

    buffer = build_zip(paths)
    return send_file(buffer, as_attachment=True, download_name=filename, mimetype="application/zip")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
