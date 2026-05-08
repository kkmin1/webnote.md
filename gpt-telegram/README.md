# Telegram Workspace Bot

Minimal Telegram bridge for:

- normal coding chat with local Codex CLI
- reading files from a local workspace
- running shell commands and tests
- rewriting one existing file with `/edit`

It uses Python standard library modules plus an already working local `codex` CLI login.

## Files

- `bot.py`: long-polling Telegram bot
- `.env.example`: config template
- `.bot_state.json`: created automatically for update offsets and chat memory

## Setup

1. Create a Telegram bot with `@BotFather` and copy the bot token.
2. Get your Telegram `chat_id`.
3. Copy `.env.example` to `.env`.
4. Fill in:
   - `TELEGRAM_BOT_TOKEN`
   - `ALLOWED_CHAT_ID`
   - `WORKSPACE_ROOT`
   - optional `CODEX_MODEL`
5. Start the bot:

```sh
cd /data/data/com.termux/files/home/telegram_workspace_bot
cp .env.example .env
python3 bot.py
```

## How To Find `chat_id`

Send a message to your bot once, then run:

```sh
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
```

Look for `message.chat.id`.

## Commands

- `/help`
- `/ping`
- `/pwd`
- `/read relative/path`
- `/run <shell command>`
- `/test <shell command>`
- `/edit relative/path :: instruction`
- `/reset`

Plain messages are forwarded to the local `codex` CLI and keep per-chat session state.

## Behavior Notes

- All file access is restricted to `WORKSPACE_ROOT`.
- Long-running work runs in the background. The bot first replies `연결됨. 처리 시작합니다.`, keeps sending Telegram `typing` status, then sends the final result.
- If the same chat sends another long-running request while one is active, the bot immediately replies `이전 작업이 아직 실행 중입니다`.
- `/ping` replies `alive / idle` or `alive / busy` immediately.
- `/edit` rewrites one existing UTF-8 text file and currently expects Codex to return the full updated file.
- `/run` and `/test` use `shell=True`, so only use this bot in a trusted private chat.
- The bot only replies to the single `ALLOWED_CHAT_ID`.
- The machine running the bot must already have a working `codex` login.

## Recommended Use

- Keep `WORKSPACE_ROOT` pointed at a dedicated project folder, not your entire home directory.
- Use git in that workspace, because `/edit` writes directly to disk.
- Use `/read` before `/edit` when you want to confirm the target file.
- Use `/reset` if you want to start a fresh Codex conversation for the same Telegram chat.

## Next Step

If you want, the next upgrade should be one of these:

1. add a safer patch-based edit flow instead of full-file rewrites
2. add `/ls` and `/tree`
3. stream command output back to Telegram
4. run the bot as a background service in Termux
