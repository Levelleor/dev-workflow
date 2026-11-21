# Work registry

[Items](items/README.md) contain durable task contracts. [Plans](plans/README.md) hold execution plans for complicated tasks.

Task records have a stable ID, parent requirement, explicit dependencies and verifiable outcome. A status in Markdown is planning information, not a trusted CI receipt.

`agentctl task claim next` selects a pending or ready story by priority (1 highest, default 3), then stable ID, skipping blockers. It atomically marks the selected story in-progress in the current working tree and emits task and project context. `task complete` marks the in-progress story implemented. There is no Ultracode execution loop or trusted acceptance gate yet.
