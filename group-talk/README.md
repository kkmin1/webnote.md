# Group Chat with AI

카카오톡 단톡방과 같은 실시간 그룹 채팅 애플리케이션입니다. 사람뿐만 아니라 AI 모델도 참여자로 함께 대화할 수 있습니다.

## 기능

- 실시간 그룹 채팅
- 다중 사용자 참여
- NVIDIA Free Endpoint, Ollama Cloud, Codex가 함께 참여하는 멀티봇 토론
- 일반 봇은 병렬로 응답하고, Codex 의장은 마지막에 종합 정리
- 참여자 목록 표시
- 시스템 메시지 (참여/퇴장)

## 기술 스택

### 프론트엔드
- React 18 + TypeScript
- Vite
- Socket.io-client

### 백엔드
- Node.js + Express
- Socket.io
- NVIDIA NIM / Ollama / Codex CLI

## 설치 및 실행

### 1. 의존성 설치

```bash
npm run install-all
```

또는 각 디렉토리에서 separately:

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 환경 변수 설정

`server/.env.example`를 복사해서 `server/.env`를 만들고 사용하세요.

### NVIDIA NIM 사용

NVIDIA는 OpenAI 호환 `chat/completions` API를 제공합니다. 기본 AI 봇 2개는 `Free Endpoint` 표시가 있는 NVIDIA 모델을 사용합니다.

```
PORT=4000
NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_ARCHITECT_MODEL=deepseek-ai/deepseek-v3.2
NVIDIA_CRITIC_MODEL=mistralai/magistral-small-2506
```

### Ollama Cloud 사용 (Gemma 4)

`gemma4:31b-cloud` 참가자는 로컬 Ollama API를 통해 연결됩니다. Ollama Cloud를 쓰려면 먼저 이 PC에서 Ollama 로그인과 클라우드 모델 준비가 되어 있어야 합니다.

```bash
ollama signin
ollama pull gemma4:31b-cloud
ollama run gemma4:31b-cloud
```

서버 설정 예시:

```
OLLAMA_BASE_URL=http://127.0.0.1:11434/api/chat
OLLAMA_GEMMA_MODEL=gemma4:31b-cloud
```

### Codex 멤버 + 의장 사용

일반 멤버와 의장 역할은 이 PC에 이미 로그인된 로컬 `codex` CLI 세션을 사용합니다.

```
CODEX_MEMBER_MODEL=gpt-5.4
CODEX_MODEL=gpt-5.4
```

### 3. 개발 서버 실행

루트 디렉토리에서:

```bash
npm run dev
```

또는 separately:

```bash
# 터미널 1 - 서버
cd server && npm run dev

# 터미널 2 - 클라이언트
cd client && npm run dev
```

## 사용 방법

1. 브라우저에서 `http://localhost:3000` 접속
2. 이름 입력 후 채팅방 참여
3. 여러 탭을 열어서 여러 사용자 테스트 가능
4. 메시지를 보내면 NVIDIA, Ollama, Codex 멤버가 병렬로 응답
5. 마지막에 `Codex Chair`가 논점을 정리하고 다음 액션을 제안
6. 각 봇은 하드코딩 템플릿이 아니라 실제 모델 응답만 사용

## 프로젝트 구조

```
group-talk/
├── server/                 # 백엔드 서버
│   ├── index.js           # Express + Socket.io 서버
│   ├── package.json
│   └── .env
├── client/                # 프론트엔드 앱
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ParticipantList.tsx
│   │   │   └── LoginModal.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── package.json
└── package.json
```

## 향후 개선 사항

- 제공자 선택 UI (NVIDIA / Ollama / Codex 등)
- 메시지 기록 저장 (데이터베이스)
- 파일 공유 기능
- 이모지 지원
- 읽음 확인 기능
- 알림 기능
