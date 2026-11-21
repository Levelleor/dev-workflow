# Agent entry point: dev-workflow

This repository builds `agentctl` and uses it for its own planning. Pi loads this file automatically; Markdown links below are **references**, not automatically included documents.

## Start work

1. Run `agentctl task claim next` to deterministically claim a pending task and receive its complete implementation prompt. Exit code 2 explains when no task is available.
2. Run `agentctl task getcontext` to resume the in-progress task. Do not manually traverse planning files when `agentctl` provides their context.
3. Implement and test with `npm run check`, then run `agentctl task complete`. This means **implemented**, not independently verified or integrated.
4. Use `agentctl --help` for command usage and `--json` for structured task results.

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
