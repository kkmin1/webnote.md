# 텔레그램 워크스페이스 봇 사용 메뉴얼
<br/>

## 개요

이 프로젝트는 텔레그램 봇을 통해 로컬의 Codex CLI를 사용하는 브리지입니다.

구조는 다음과 같습니다.

- 텔레그램 `mybot` 채팅방에서 메시지 전송
- 로컬의 `bot.py`가 텔레그램 메시지를 수신
- 일반 메시지는 로컬 `codex exec` 또는 `codex exec resume`으로 전달
- 파일 읽기, 명령 실행, 테스트 실행, 파일 수정 명령도 함께 처리

즉, 별도의 OpenAI API 키 과금 방식이 아니라, 현재 기기에 이미 로그인되어 있는 Codex CLI를 텔레그램에서 원격으로 쓰는 방식입니다.
<br/>

## 프로젝트 위치<br/><br/>

### termux
- `/data/data/com.termux/files/home/telegram_workspace_bot`
### windows
- `C:\Users\kkmin\.gemini\antigravity\scratch\gpt-telegram`

주요 파일:

- `bot.py`: 텔레그램 브리지 메인 스크립트
- `.env`: 실제 실행 설정 파일
- `.env.example`: 예시 설정 파일
- `.bot_state.json`: 텔레그램 채팅별 Codex 세션 상태 저장 파일
- `README.md`: 영문 개요 문서

## 준비 조건

다음 조건이 먼저 충족되어야 합니다.

1. 텔레그램 봇이 하나 있어야 함
2. `@BotFather`에서 봇 토큰을 발급받아야 함
3. 사용할 텔레그램 `chat_id`를 알아야 함
4. 이 기기에서 `codex` 명령이 동작하고 로그인되어 있어야 함

## PC에서도 사용 가능

이 프로젝트는 Termux 전용이 아니라 PC에서도 사용할 수 있습니다.

가능한 환경 예:

- Windows PowerShell
- Windows Terminal
- macOS Terminal
- Linux shell

중요한 조건은 운영체제보다 아래 두 가지입니다.

- `python` 또는 `python3` 명령으로 `bot.py`를 실행할 수 있어야 함
- `codex` CLI가 설치되어 있고 이미 로그인된 상태여야 함

## BotFather와 mybot의 차이

헷갈리기 쉬운 부분입니다.

- `@BotFather`: 봇 생성, 토큰 발급, 설정 변경
- `mybot`: 실제로 메시지를 보내는 봇 채팅방

정리하면:

- 토큰 확인은 `@BotFather`
- 실제 사용은 `mybot`

## chat_id 찾는 방법

1. 텔레그램에서 실제 `mybot` 채팅방을 엽니다.
2. `hi` 같은 메시지를 하나 보냅니다.
3. Termux에서 아래 명령을 실행합니다.

```sh
curl "https://api.telegram.org/bot실제토큰/getUpdates"
```

4. 출력된 JSON에서 아래 값을 찾습니다.

```json
"chat": {
  "id": 8535487804
}
```

여기서 `chat.id` 숫자가 `ALLOWED_CHAT_ID`입니다.

## .env 파일 작성

이 프로젝트는 이름이 정확히 `.env`인 파일만 읽습니다.

예:

- 맞는 이름: `.env`
- 틀린 이름: `e.txt`
- 틀린 이름: `example.env`

최소 설정 예시는 다음과 같습니다.

```env
TELEGRAM_BOT_TOKEN=여기에_봇_토큰
ALLOWED_CHAT_ID=8535487804
WORKSPACE_ROOT=/data/data/com.termux/files/home
```

Windows 예시는 다음과 같습니다.

```env
TELEGRAM_BOT_TOKEN=여기에_봇_토큰
ALLOWED_CHAT_ID=8535487804
WORKSPACE_ROOT=C:\Users\사용자이름\projects\myproject
```

추가 설정까지 포함한 예시는 다음과 같습니다.

```env
TELEGRAM_BOT_TOKEN=여기에_봇_토큰
ALLOWED_CHAT_ID=8535487804
WORKSPACE_ROOT=/data/data/com.termux/files/home
CODEX_MODEL=gpt-5.4
POLL_TIMEOUT_SECONDS=10
COMMAND_TIMEOUT_SECONDS=120
CODEX_TIMEOUT_SECONDS=900
MAX_FILE_CHARS=24000
MAX_OUTPUT_CHARS=6000
```

### 각 항목 의미

`TELEGRAM_BOT_TOKEN`

- `@BotFather`에서 발급받은 실제 봇 토큰
- `.env` 안에는 `bot` 접두사를 붙이지 않음

예:

```env
TELEGRAM_BOT_TOKEN=1234567890:AA....
```

`ALLOWED_CHAT_ID`

- 이 봇이 응답을 허용할 텔레그램 대화방 ID
- 개인 대화에서는 보통 숫자 하나

`WORKSPACE_ROOT`

- `/read`, `/run`, `/test`, `/edit`가 동작할 작업 기준 폴더
- 가능하면 홈 전체보다 실제 프로젝트 폴더로 좁히는 것이 안전

예:

```env
WORKSPACE_ROOT=/data/data/com.termux/files/home/myproject
```

Windows 예:

```env
WORKSPACE_ROOT=C:\Users\사용자이름\projects\myproject
```

`CODEX_MODEL`

- Codex CLI 호출 시 사용할 모델
- 생략하면 기본값 사용

`POLL_TIMEOUT_SECONDS`

- 텔레그램 새 메시지를 기다리는 폴링 시간

`COMMAND_TIMEOUT_SECONDS`

- `/run`, `/test` 명령 최대 실행 시간

`CODEX_TIMEOUT_SECONDS`

- Codex 응답을 기다리는 최대 시간

`MAX_FILE_CHARS`

- `/edit`에서 처리할 파일 최대 크기

`MAX_OUTPUT_CHARS`

- 텔레그램으로 돌려줄 출력 최대 길이

## 실행 방법

### Termux에서 실행

Termux에서는 아래처럼 실행합니다.

```sh
cd /data/data/com.termux/files/home/telegram_workspace_bot
python3 bot.py
```

### Windows PowerShell에서 실행

Windows에서는 아래처럼 실행하면 됩니다.

```powershell
cd C:\Users\kkmin\.gemini\antigravity\scratch\gpt-telegram
python bot.py
```

`python` 명령이 안 되면 아래처럼 시도합니다.

```powershell
py bot.py
```

### macOS 또는 Linux에서 실행

```sh
cd ~/telegram_workspace_bot
python3 bot.py
```

정상 실행되면 터미널에 `workspace_root=...`가 표시되고 대기 상태가 됩니다.

이 상태에서 텔레그램 `mybot` 채팅방에서 명령이나 일반 메시지를 보내면 됩니다.

## 텔레그램에서 사용하는 방법

먼저 아래 명령으로 연결을 확인합니다.

```text
/help
```

지원 명령은 다음과 같습니다.

`/help`

- 사용 가능한 명령 표시

`/ping`

- 봇이 살아 있는지 즉시 확인
- 응답 예: `alive / idle`, `alive / busy`

`/pwd`

- 현재 `WORKSPACE_ROOT` 표시

`/read 경로`

- `WORKSPACE_ROOT` 아래 파일 내용 읽기

예:

```text
/read bot.py
```

`/run 명령`

- 셸 명령 실행

예:

```text
/run ls -la
```

`/test 명령`

- 테스트 명령 실행

예:

```text
/test pytest
```

`/edit 경로 :: 수정지시`

- 기존 파일 하나를 읽고, Codex에게 전체 파일을 다시 쓰도록 요청

예:

```text
/edit app.py :: 로그를 더 자세히 남기도록 수정해줘
```

`/reset`

- 현재 텔레그램 채팅에 연결된 Codex 세션 초기화
- 새 대화를 다시 시작하고 싶을 때 사용

### 일반 메시지

명령어가 아닌 일반 메시지는 로컬 Codex CLI로 전달됩니다.

예:

```text
현재 프로젝트 구조를 보고 배포 흐름을 설명해줘
```

같은 텔레그램 채팅에서는 이전 대화를 이어갑니다.

긴 작업은 백그라운드에서 처리됩니다. 일반 메시지, `/run`, `/test`, `/edit`처럼 오래 걸릴 수 있는 요청은 먼저 `연결됨. 처리 시작합니다.`를 보내고, 작업이 끝나면 최종 결과를 다시 보냅니다.

작업 중에는 텔레그램에 `typing` 상태를 계속 보내며, 같은 채팅에서 새 긴 작업을 또 보내면 `이전 작업이 아직 실행 중입니다`라고 바로 응답합니다.

## 현재 동작 방식

이 프로젝트는 내부적으로 다음처럼 동작합니다.

- 새 대화: `codex exec`
- 이어지는 대화: `codex exec resume`

그리고 대화 상태는:

- `.bot_state.json`

에 저장됩니다.

따라서 `/reset`을 하지 않으면 같은 텔레그램 채팅에서 문맥이 유지됩니다.

## 자주 발생하는 문제

### 1. `Missing required env var: TELEGRAM_BOT_TOKEN`

원인:

- `.env` 파일이 없거나
- 파일명이 `.env`가 아니거나
- `TELEGRAM_BOT_TOKEN=` 줄이 없을 때

확인:

- 파일명이 정확히 `.env`인지 확인
- 봇 폴더 안에 있는지 확인

### 2. 텔레그램 API `401 Unauthorized`

원인:

- 봇 토큰이 잘못되었거나
- 폐기된 예전 토큰을 사용했거나
- `.env` 안의 토큰 값이 틀렸을 때

검증:

```sh
curl "https://api.telegram.org/bot실제토큰/getMe"
```

정상이면 `ok: true`가 나와야 합니다.

### 3. `@BotFather`와 `mybot` 혼동

정리:

- `@BotFather`는 관리용
- `mybot`은 실제 사용용

### 4. 휴대폰 에디터로 만든 설정 파일이 안 먹는 경우

가능한 원인:

- 파일명이 `.env`가 아님
- 줄 끝 공백이나 보이지 않는 문자
- 다른 확장자로 저장됨
- 예전 토큰이 들어감

가장 중요한 것은:

- 파일명은 반드시 `.env`
- 내용은 정확한 최신 토큰

### 5. PC에서 `python` 또는 `codex` 명령이 안 잡히는 경우

가능한 원인:

- Python이 설치되지 않았음
- 설치는 되었지만 PATH에 잡히지 않았음
- Codex CLI가 설치되지 않았거나 로그인 전 상태임

확인 예시:

```powershell
python --version
codex --version
```

둘 중 하나라도 실행되지 않으면 해당 도구 설치 또는 PATH 확인이 먼저 필요합니다.

## 보안 주의사항

다음 값은 민감 정보입니다.

- `TELEGRAM_BOT_TOKEN`
- `.env` 파일 전체

공유용 압축 파일을 만들 때는 아래 파일을 제외하는 것이 안전합니다.

- `.env`
- `.bot_state.json`

## 세션 복구

현재 Codex CLI 세션을 다시 이어오고 싶으면:

```sh
cd /data/data/com.termux/files/home/telegram_workspace_bot
codex resume --last
```

주의:

- `codex resume --last`는 CLI 대화 복구
- `python3 bot.py`는 텔레그램 브리지 실행

둘은 서로 다른 역할입니다.

## 권장 운영 방식

1. `WORKSPACE_ROOT`는 홈 전체보다 프로젝트 폴더 하나로 제한
2. 텔레그램 봇은 개인 채팅에서만 사용
3. 중요한 작업 전에는 git으로 상태를 관리
4. `/edit` 사용 전에는 `/read`로 대상 파일 확인
5. 문맥이 꼬이면 `/reset` 사용

## 한 줄 실행 요약

실행:

```sh
cd /data/data/com.termux/files/home/telegram_workspace_bot
python3 bot.py
```

CLI 세션 복구:

```sh
cd /data/data/com.termux/files/home/telegram_workspace_bot
codex resume --last
```

텔레그램 연결 확인:

```text
/help
```
