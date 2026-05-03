# GitHub Pages JS-only Converter

이 폴더는 `GitHub Pages`에 바로 올릴 수 있는 정적 웹앱입니다.

## 지원 흐름

- `docx -> html`
- `docx -> markdown`
- `markdown -> html`
- `html -> markdown`
- `markdown -> docx`
- `html -> docx`

## 핵심 특징

- 서버 없이 브라우저에서만 실행
- `GitHub Pages`에 바로 배포 가능
- `showSaveFilePicker()` 지원 브라우저에서는 저장 위치 선택 가능
- 미지원 브라우저에서는 일반 다운로드로 폴백

## 배포 방법

GitHub 저장소에서 `converter/docs` 폴더를 Pages 소스로 잡으면 됩니다.

## 사용 라이브러리

- `mammoth`
- `turndown`
- `marked`
- `dompurify`
- `docx`
