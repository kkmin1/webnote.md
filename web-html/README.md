# HTML WIZWIG 에디터

`index.html`은 HTML 문법으로 내용을 입력하면 오른쪽 미리보기 화면에서 즉시 웹페이지 결과를 확인할 수 있는 단일 파일 웹앱입니다.

왼쪽의 HTML 에디터에 코드를 작성하거나 수정하면, 오른쪽의 웹페이지 미리보기 영역에 렌더링 결과가 바로 반영됩니다. 별도의 빌드나 서버 실행 없이 브라우저에서 `index.html`을 열어 사용할 수 있습니다.

## 주요 기능

- HTML 문법 입력 및 실시간 미리보기
- 표, 링크, 이미지, 버튼, 입력 요소 등 일반 HTML 요소 렌더링
- MathJax 기반 수식 입력 지원
- SVG 코드 작성 및 미리보기 지원
- JavaScript가 포함된 HTML 예제 실행
- 로컬 이미지 업로드 후 현재 편집 문서에 이미지 태그 삽입
- HTML 파일 불러오기
- 다른 이름으로 저장

## 수식 입력

MathJax 문법을 사용해 인라인 수식과 블록 수식을 작성할 수 있습니다.

```html
<p>인라인 수식: \( E = mc^2 \)</p>

$$ \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi} $$
```

## SVG 입력

HTML 안에 SVG 태그를 직접 작성하면 미리보기 영역에서 바로 벡터 이미지로 표시됩니다.

```html
<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="180" height="100" rx="10" fill="#3b82f6"/>
  <circle cx="100" cy="60" r="30" fill="#fff"/>
  <text x="100" y="66" text-anchor="middle" fill="#3b82f6">SVG</text>
</svg>
```

## 참고 사항

- `showSaveFilePicker()`를 지원하는 Chrome/Edge 계열 브라우저에서는 저장 위치를 직접 선택할 수 있습니다.
- 로컬 이미지 업로드는 브라우저 보안 정책상 실제 파일 경로가 아니라 현재 브라우저 세션의 `blob:` 링크로 연결됩니다.
- Tailwind CSS와 MathJax는 CDN을 사용하므로 인터넷 연결이 없으면 일부 스타일이나 수식 렌더링이 제한될 수 있습니다.
