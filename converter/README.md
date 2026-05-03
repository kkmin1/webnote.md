# Docx Markdown Converter

로컬에서 `docx -> md`와 `md -> docx`를 처리하는 Flask 웹앱입니다.

## 핵심 동작

- `docx -> md`: `MarkItDown` 사용
- `md -> docx`: `pandoc` 사용
- 여러 DOCX 파일 일괄 업로드 지원
- Markdown 직접 입력 후 DOCX 생성 지원

## 실행 방법

```powershell
python app.py
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:5000
```

## 필요 조건

- `python`
- `Flask`
- `markitdown`
- `pandoc`

현재 환경에서는 `markitdown`과 `pandoc`가 설치되어 있는 것을 확인했습니다.
