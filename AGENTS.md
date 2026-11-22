# Agent entry point: dev-workflow

This repository builds `agentctl` and uses it for its own planning. Pi loads this file automatically; Markdown links below are **references**, not automatically included documents.

## Start work

1. Run `agentctl task claim next` to choose by priority, or `agentctl task claim STORY-0001` to select an exact task. Both return the claimed story ID, title and status without context. Exit code 2 explains when a claim is unavailable.
2. Run `agentctl task getcontext [STORY-0001]` to retrieve the full implementation context after claiming, or to resume an in-progress task. Do not manually traverse planning files when `agentctl` provides their context.
3. Implement and test with `npm run check`, then run `agentctl task complete [STORY-0001]`. This means **implemented**, not independently verified or integrated.
4. Record task discoveries with `agentctl task notes add "text"`; use `agentctl task notes list` to review them. For another story, specify its ID after `task`.
5. Use `agentctl verify` for all registered checks, `agentctl verify list` to inspect gates, or `agentctl verify NAME` for one. New checks may be appended with `verify add NAME -- COMMAND`; never weaken existing checks.
6. Use `agentctl --help` for command usage and `--json` for structured results.

## Working conventions

- Access durable planning and knowledge via `agentctl work`, `agentctl knowledge` and `agentctl task`.
- Do not silently rewrite requirements, accepted decisions or trusted check policy.
- Maintain stable record IDs and links; record design uncertainty explicitly.
- Never commit secrets, transcripts or `.agentctl/runtime/`.
- POC: one in-progress task per working tree, serial integration. Ultracode execution is planned, not active.

## Reference map (not automatically followed)

- [Project goals](docs/product/PRD-0001.md)
- [Architecture](docs/architecture/overview.md)
- [Knowledge conventions](docs/knowledge/README.md)
- [Decision index](docs/decisions/README.md)
- [Work index](docs/work/README.md)
- [Workflow design](workflows/feature.md)

The `.agentctl/project.yaml` configuration explicitly selects project context to include and optional documents to reference. Pi itself does not recursively expand these Markdown links.
