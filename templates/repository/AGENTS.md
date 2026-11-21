# Agent entry point

This repository uses `agentctl` for work planning and task state. Pi loads this file on startup.

1. Run `agentctl task claim next` to claim one pending task and obtain a complete prompt.
2. Run `agentctl task getcontext` to resume the in-progress task.
3. Implement and test, then run `agentctl task complete`. This marks work `implemented`, not verified or accepted.
4. Use `agentctl --help` for all commands, or `--json` for integration.

Use `agentctl work` and `agentctl knowledge` instead of manually finding planning documents. Project context is declared in `.agentctl/project.yaml`; optional paths are references only.

Never silently modify accepted requirements, decisions or verification policy merely to pass a task. Never commit credentials or `.agentctl/runtime/`. Parallel worktrees require a shared coordinator.
