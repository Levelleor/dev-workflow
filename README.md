# dev-workflow

A reusable, repository-backed development workflow for Pi coding agents, with **Ultracode selected as the initial orchestration engine**.

This is the **repository scaffold**, not a working autonomous development harness. The CLI, runtime adapters, test-policy enforcement and workflow automation are not yet implemented.

## What lives here

- [`packages/`](packages/README.md): separately versionable TypeScript packages, including the future npm CLI.
- [`agents/`](agents/README.md): portable role contracts for architect, worker, reviewer and knowledge curator.
- [`workflows/`](workflows/README.md): intended feature lifecycle and Ultracode orchestration boundary.
- [`templates/`](templates/README.md): files copied into other repositories during future `init`.
- [`docs/`](docs/README.md): dev-workflow's own product requirements, architecture, decisions and task records.
- [`.agentctl/`](.agentctl/README.md): this repository's own harness configuration.

## Self-hosting

This project is also its first target repository. Its `AGENTS.md`, `.agentctl/` configuration, specifications and work items follow the same conventions that the eventual CLI will install elsewhere. At present they are reference artifacts, not automated controls.

## Ground rules

- Keep requirements, architectural decisions and planned work in Git; resolve branch conflicts during integration.
- Use **one worker at a time for the first POC**. Design interfaces to permit parallel worktrees and serial integration later.
- Execution logs, credentials and temporary state must not be committed.
- A worker's completion claim is not verification. CI and an eventual trusted verification runner provide acceptance evidence.
- Ultracode is the chosen POC orchestrator; do not build a second independent orchestration loop without a recorded decision.

## Start here

Read [`AGENTS.md`](AGENTS.md), then [`docs/product/PRD-0001.md`](docs/product/PRD-0001.md) and [`docs/architecture/overview.md`](docs/architecture/overview.md).

For now, `npm test` checks the repository scaffold using Node's built-in test runner. It does **not** test an agent workflow.
