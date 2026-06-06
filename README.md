# Webnote.md

`Webnote.md`는 마크다운 노트를 작성하고 보는 웹 기반 노트 앱입니다.

기본 저장 형식은 `.md` 파일이며, 이미지 첨부와 LaTeX 수식 렌더링을 지원합니다. Google Drive를 외부 저장소로 연결하면 여러 기기에서 같은 노트를 불러오고 저장할 수 있습니다.

## 주요 기능

- `.md` 마크다운 노트 작성과 편집
- 폴더 기반 노트 관리
- 이미지 붙여넣기, 드래그 앤 드롭, 파일 선택 첨부
- 첨부 이미지를 `media/` 폴더에 저장하고 마크다운 이미지 링크로 삽입
- LaTeX 인라인 수식과 블록 수식 렌더링
- Google Drive 자동 업로드 동기화
- 브라우저에서 실행 가능한 정적 웹앱

## 실행 방법

Google Drive 연동을 사용하려면 `file:///.../index.html`로 직접 열면 안 됩니다. 반드시 로컬 HTTP 서버나 GitHub Pages 같은 웹 주소로 실행해야 합니다.

PowerShell에서:

```powershell
cd C:\Users\kkmin\.gemini\antigravity\scratch\webnote.md
python -m http.server 8765 --bind 127.0.0.1
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8765/web/index.html
```

`python` 명령이 동작하지 않으면 아래 명령을 사용합니다.

```powershell
py -m http.server 8765 --bind 127.0.0.1
```

## GitHub Pages 배포

GitHub Pages로 배포하면 다른 기기에서 로컬 서버를 매번 실행하지 않고 URL로 접속할 수 있습니다.

1. GitHub 저장소 Settings로 이동합니다.
2. Pages 메뉴를 엽니다.
3. Source를 `Deploy from a branch`로 설정합니다.
4. Branch를 `main`, 폴더를 `/root`로 설정합니다.
5. 배포가 완료되면 아래 주소 형식으로 접속합니다.

```text
https://kkmin1.github.io/webnote.md/web/index.html
```

## Google Drive 동기화

Google Drive를 외부 노트 저장소로 사용할 수 있습니다.

앱은 Google Drive 안에 `webnote.md` 폴더를 만들고, 노트와 이미지를 그 안에 업로드합니다. 이미지 파일은 Drive에서도 `webnote.md/media/` 하위 폴더에 저장됩니다. 각 파일에는 원래 앱 내부 경로가 Drive `appProperties`로 저장됩니다. 예를 들면 `/Notes.md`, `/media/image.png` 같은 경로입니다.

### Google Cloud 설정

1. Google Cloud Console에서 프로젝트를 만듭니다.
2. Google Drive API를 활성화합니다.
3. OAuth 2.0 Client ID를 만듭니다.
4. Application type은 `Web application`으로 선택합니다.
5. Authorized JavaScript origins에 실행 주소를 등록합니다.

로컬 서버에서 테스트할 때:

```text
http://127.0.0.1:8765
```

GitHub Pages로 배포할 때:

```text
https://kkmin1.github.io
```

앱에서 상단 Google Drive 버튼을 누르면 OAuth Web Client ID를 입력하라는 창이 나옵니다. Google 로그인을 승인하면 이후 저장되는 노트가 Google Drive로 업로드됩니다.

## 이미지 첨부

이미지는 세 가지 방식으로 넣을 수 있습니다.

- 클립보드에서 이미지 붙여넣기
- 이미지 파일을 에디터에 드래그 앤 드롭
- 상단 이미지 버튼으로 파일 선택

이미지를 넣으면 앱이 `media/` 폴더에 파일을 저장하고, 현재 노트에는 아래와 같은 마크다운 문법을 삽입합니다.

```md
![image name](media/image-name.png)
```

Google Drive가 연결되어 있으면 첨부 이미지도 자동으로 Drive에 업로드됩니다.

## LaTeX 수식

KaTeX 기반 수식 렌더링을 지원합니다.

인라인 수식:

```md
$E = mc^2$
\( E = mc^2 \)
```

블록 수식:

```md
$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
```

```md
\[
x^2 + y^2 = r^2
\]
```

## 저장 구조

기본적으로 노트는 사용자가 선택한 로컬 폴더에 `.md` 파일로 저장됩니다.

Google Drive가 연결된 경우:

- 로컬 저장은 그대로 유지됩니다.
- 저장된 `.md` 파일이 Google Drive의 `webnote.md` 폴더로 업로드됩니다.
- `media/` 폴더의 이미지는 Drive의 `webnote.md/media/` 하위 폴더에 업로드됩니다.
- 다른 기기에서 Drive 연결을 하면 Drive 파일을 다시 가져옵니다.
- 이미 연결된 브라우저는 창에 다시 포커스가 돌아올 때 Drive 변경사항을 가져옵니다.
- 상단 Google Drive 버튼을 다시 누르면 즉시 동기화를 시도합니다.

현재 동기화는 단순 모델입니다. 여러 기기에서 같은 노트를 동시에 수정하면 마지막으로 업로드된 내용이 우선합니다.

## 주요 파일

- `web/index.html`: 앱 진입점
- `web/editor.js`: 에디터, 이미지 첨부, LaTeX 렌더링 연결
- `web/files.js`: 파일 저장, 자동 저장, 동기화 hook
- `web/drive.js`: Google Drive OAuth와 업로드/가져오기
- `web/app.css`: 앱 UI 스타일
- `web/offline.js`: 오프라인 캐시용 service worker

## 주의사항

- Google Drive 동기화는 `file://`로 열면 동작하지 않습니다.
- Chrome 계열 브라우저에서 가장 안정적으로 동작합니다.
- Google OAuth Web Client ID는 프론트엔드 앱에서 보이는 값입니다. 대신 Authorized JavaScript origins를 정확히 제한해야 합니다.
- 노트 데이터는 GitHub 저장소에 올라가지 않습니다. GitHub에는 앱 코드만 올라갑니다.

## 저장소

GitHub 저장소:

```text
https://github.com/kkmin1/webnote.md
```
