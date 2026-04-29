# Scratch AGENTS

This file defines default working rules for any project under `C:\Users\kkmin\.gemini\antigravity\scratch`.

## Startup

- When starting work in any subfolder of `scratch`, read this file before making substantial changes.
- Treat this file as the shared agent policy for all scratch projects unless a deeper project-specific rule clearly overrides it.

## Git

- Before substantial edits, check whether the current workspace is already a git repository.
- If the workspace is not a git repository and the task involves meaningful edits, initialize git first.
- After meaningful file edits, create a git commit for the changes made in the current task.
- Keep commits scoped to the current task and avoid bundling unrelated changes from other scratch projects.
- If the git root is broader than the current project, stage only the files that belong to the current task before committing.

## Editing

- Preserve working behavior unless the user asked for a behavior change.
- Prefer explicit, reviewable edits over hidden automation.
- When a shared rule conflicts with a project-specific rule, prefer the more specific rule and mention the override briefly.

## Communication

- Be explicit about assumptions that materially affect code or data.
- If a requested change has non-obvious risk, pause and surface the tradeoff before making the risky change.
