# Agent entry point

This repository uses `agentctl` for work planning and task state. Pi loads this file on startup.

1. Run `agentctl task claim next` to select by priority or `agentctl task claim STORY-0001` to claim that task directly; both return the claimed story metadata, not its prompt.
2. Run `agentctl task getcontext [STORY-0001]` to load the full task context after claiming or when resuming.
3. Implement and test, then run `agentctl task complete [STORY-0001]`. Completion runs all registered gates and marks work `implemented` only if every gate passes, not independently reviewed or accepted.
4. Record task discoveries with `agentctl task notes add "text"` (or `task STORY-0001 notes add "text"`).
5. Run `agentctl verify` for all gates, `verify list` to inspect them, or `verify NAME` for one. Add missing gates with `verify add NAME -- COMMAND` without weakening existing ones.
6. Use `agentctl --help` for all commands, or `--json` for integration.

Use `agentctl work` and `agentctl knowledge` instead of manually finding planning documents. Project context is declared in `.agentctl/project.yaml`; optional paths are references only.

Find records with `agentctl knowledge search "topic"` or `agentctl work search "topic"`. Read a match with `show ID --body`. Use `agentctl knowledge --help` or `agentctl work --help` for filters and dependency lookup.

Use `agentctl knowledge add -h` or `agentctl work add -h` for section names and examples of supplying Markdown. Run `agentctl docs lint` after editing docs directly.

Never silently modify accepted requirements, decisions or verification policy merely to pass a task. Never commit credentials or `.agentctl/runtime/`. Parallel worktrees require a shared coordinator.
