# Work registry

[Items](items/README.md) contain durable task contracts. [Plans](plans/README.md) hold execution plans for complicated tasks.

Task records have a stable ID, parent requirement, explicit dependencies and verifiable outcome. A status in Markdown is planning information, not a trusted CI receipt.

`agentctl task claim next` selects a pending or ready story by priority (1 highest, default 3), then stable ID, skipping blockers. `agentctl task claim STORY-0001` selects that exact stable ID instead of following priority, but applies the same eligibility and ownership checks. It atomically marks the selected story in-progress in the current working tree and returns compact task metadata. Run `agentctl task getcontext [STORY-0001]` separately to assemble the full task and project context. Missing required context does not prevent claiming, but causes `getcontext` to fail; the story remains in-progress for recovery. `task complete` marks the in-progress story implemented. There is no Ultracode execution loop or trusted acceptance gate yet.

## Task-local notes

`agentctl task notes add|list|remove` operates on the single in-progress task. Use `agentctl task STORY-0002 notes add|list|remove` to target another task. Notes are stored in the story's `## Notes` section, with stable per-task IDs; they are included in subsequent context retrieval. Use the knowledge inbox instead for discoveries that are not task-specific.
