# Telegram bot

How the server wires Telegram updates into per-user workers and how `Bot.Reply` decides what to do with each message.

## High-level architecture

```mermaid
flowchart TB
    TG[Telegram API]
    PWA[PWA app.files.md]

    subgraph Server [server - one binary]
        Main[main update loop<br/>api.GetUpdatesChan]
        Router{Route by userID}
        UCh[per-user channel]
        Sup[supervisor goroutine<br/>panic-recovering]
        Proc[processUserUpdates<br/>sequential loop]
        Bot[Bot.Reply]

        Web[sync.Serve<br/>HTTP API]
        Worker[worker ticker 5s<br/>MoveDueTasks<br/>RemoveCompletedChecklistItems]

        UserFS[(UserFS<br/>storage/userID/*.md)]
        DB[(per-user DB<br/>in-memory state)]
        Cfg[(config.json)]
    end

    TG -->|long poll updates| Main
    Main --> Router
    Router -->|first time: spawn| Sup
    Router -->|every update| UCh
    UCh --> Sup
    Sup --> Proc
    Proc --> Bot

    PWA <-->|POST /syncFilenames, /syncFile, /syncMediaFilenames, /syncMediaFile| Web

    Worker -->|due tasks| Bot
    Bot -->|read/write .md| UserFS
    Bot -->|temp state| DB
    Bot -->|preferences| Cfg
    Web -->|read/write .md| UserFS
    Bot -->|send, edit, delete msgs| TG
```

The server runs one binary with three long-running components:

- **Telegram update loop** (`cmd/server/server.go`) - long-polls Telegram, routes each update to a per-user goroutine. Per-user channels serialize one user's messages so concurrent edits to the same files can't race.
- **HTTP sync server** (`server/sync`) - serves the PWA's sync requests (`/syncFilenames`, `/syncFile`, `/syncMediaFilenames`, `/syncMediaFile`). When the web app changes `Chat.md` or the chat, it calls `OnChatUpdate` which triggers the bot to send the user a fresh home keyboard so the two stay in lockstep.
- **Worker ticker** - every 5 seconds moves scheduled tasks out of `later` into `chat`, and prunes completed checklist items.

Everything reads and writes the same per-user filesystem tree (`UserFS`), which is the single source of truth - `.md` files on disk. The PWA fetches those same files through the sync API.

## `Bot.Reply` - reply flow

```mermaid
flowchart TD
    Start([Update arrives at Bot.Reply])
    IQ{Inline query?}
    Plug{Plugin.CanHandle?}
    ViaBot{Sent via bot?<br/>inline result}
    Cmd{extractCmd<br/>returns a command?}
    IsCB{Callback query?}
    HasImg{Has image?}

    Search[answerSearch<br/>return file results]
    ChanSave[addToFile<br/>append to ChannelName.md]
    PlugRun[plugin.Handle<br/>send output<br/>ShowHome]
    FileReq[answerFileRequest<br/>resolve file]
    DelKB[delAllKeyboards]
    Handler[dispatch to handlers map<br/>e.g. showMoveTo, moveToDir,<br/>complete, schedule, ...]
    AnswerCB[AnswerCallbackQuery<br/>completedMsg or empty]
    SaveImg[saveFromImage]
    SaveTxt[saveFromTextMsg]

    Start --> IQ
    IQ -->|yes| Search --> End([return])
    IQ -->|no| Chan
    Chan -->|yes| ChanSave --> End
    Chan -->|no| Plug
    Plug -->|yes| PlugRun --> End
    Plug -->|no| ViaBot
    ViaBot -->|yes| FileReq --> End
    ViaBot -->|no| Cmd
    Cmd -->|yes, not callback| DelKB --> Handler
    Cmd -->|yes, callback| Handler
    Handler --> IsCB
    IsCB -->|yes| AnswerCB --> End
    IsCB -->|no| End
    Cmd -->|no| HasImg
    HasImg -->|yes| SaveImg --> End
    HasImg -->|no| SaveTxt --> End

    style Search fill:#dfe,stroke:#374,color:#000
    style ChanSave fill:#dfe,stroke:#374,color:#000
    style PlugRun fill:#dfe,stroke:#374,color:#000
    style FileReq fill:#dfe,stroke:#374,color:#000
    style Handler fill:#ffd,stroke:#c80,color:#000
    style SaveImg fill:#fde,stroke:#a36,color:#000
    style SaveTxt fill:#fde,stroke:#a36,color:#000
```

The decision is strictly top-to-bottom - the first matching case wins. Green terminals are read-only or side-channel responses; yellow is the large callback/command dispatch table; red is the save path for fresh user content.

### Main steps inside the save paths

```mermaid
flowchart TD
    subgraph txt [saveFromTextMsg]
        T1([message text]) --> T2[extractMarkdown]
        T2 --> T3{recent forward<br/>within collapse window?}
        T3 -->|yes| T4[createOrAdd to Chat.md] --> TEnd([return])
        T3 -->|no| T5{reply to a<br/>previous bot msg?}
        T5 -->|yes| T6[addToRepliedFile<br/>append to that note] --> TEnd
        T5 -->|no| T7[saveToInbox]
        T7 --> T8{ChatOnlyMode?}
        T8 -->|yes| T9[react 👌] --> TEnd
        T8 -->|no| T10{JournalOnlyMode?}
        T10 -->|yes| T11[moveToJournal] --> TEnd
        T10 -->|no| T12[showMoveTo<br/>buttons: to Home,<br/>to file, to dir, ...] --> TEnd
    end

    subgraph img [saveFromImage]
        I1([photo/document]) --> I2[DownloadFile]
        I2 --> I3[fs.Write media/tg_*.ext]
        I3 --> I4[build markdown image link<br/>plus caption]
        I4 --> I5[same branching as saveFromTextMsg:<br/>collapse -> reply -> Inbox -> showMoveTo]
    end
```

Both save paths converge on `saveToInbox` (append to `Inbox.md` with a timestamp) and then `showMoveTo`, which presents the user with action buttons. Picking a button fires a callback that re-enters `Bot.Reply`, hits the command branch, and runs the matching handler from the big map at `bot.go:327–415` (move to file, move to dir, schedule, complete, share, rename, etc.).

### What the handlers table looks like

A small taste of the command namespace (~90 entries in total, defined as `CmdX` constants around `bot.go:128–207`):

| Category | Examples |
| --- | --- |
| Views | `ShowHome`, `ShowLater`, `ShowFiles`, `ShowDirs`, `ShowChecklists`, `ShowSettings` |
| Move | `MoveToExistingDir`, `MoveToNewFile`, `MoveToJournal`, `MoveToLater`, `MoveToChecklist`, `MoveToRead`/`Watch`/`Shop` |
| Complete | `Complete`, `CompleteFromInbox`, `CompleteListItem`, `CompleteHabit` |
| Schedule | `Schedule`, `ScheduleForTmrw`, `ShowScheduleForDay`, `Pomodoro` |
| Rename | `ShowRename`, `ShowRenameFile`, `Rename` |
| Settings | `TasksOnlyMode`, `NotesOnlyMode`, `JournalOnlyMode`, `FullMode`, `ChatMode`, `Timezone` |
| Other | `OpenInApp`, `Download`, `Share`, `Help`, `Stats` |

Shortcut suffixes like ` jj` / ` жж` (append to journal) or `++` (append to most recently used file) are expanded into normal commands in `extractCmd` before dispatch.

## Concurrency guarantees in one line

One user's updates are processed strictly sequentially inside their own goroutine, but different users run in parallel - so the bot never races its own file writes for a single user, and the web app's sync API can safely modify the same files as the bot because the per-user worker holds the only write path for bot-initiated changes.
