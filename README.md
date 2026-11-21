# dev-workflow

A repository-backed, cost-conscious coding-agent harness for Pi, with **Ultracode selected for orchestration**.

The first functional component is **agentctl**, a TypeScript CLI for repository bootstrap, deterministic sequential task claiming and context assembly, typed knowledge records, configuration inspection and local check profiles. Automated agent execution, review and integration remain future milestones.

## Monorepo

- [`packages/cli/`](packages/cli/README.md): npm package `@levelleor/agentctl` (binary: `agentctl`; private until publication).
- [`packages/core/`](packages/core/README.md): planned shared contracts and policy.
- [`packages/knowledge/`](packages/knowledge/README.md): planned storage adapter.
- [`packages/verification/`](packages/verification/README.md): planned trusted verifier.
- [`packages/runtime-ultracode/`](packages/runtime-ultracode/README.md): planned Ultracode adapter.
- [`agents/`](agents/README.md): portable role contracts.
- [`workflows/`](workflows/feature.md): intended sequential feature lifecycle.
- [`templates/`](templates/README.md): portable repository and record templates.
- [`docs/`](docs/README.md): dev-workflow's own versioned product knowledge.
- [`.agentctl/`](.agentctl/README.md): this repository's self-hosted harness configuration.

## Development

Node.js 24 or newer is required (see `.nvmrc`). CI runs on Node 24 and caches npm package downloads.

```sh
npm install
npm run check
node packages/cli/dist/index.js --help
```

See [CLI usage](packages/cli/README.md) and [agent entry point](AGENTS.md). GitHub Actions runs TypeScript type checking, build, Vitest unit tests, existing scaffold tests and a CLI packaging smoke check.

## Boundaries

Knowledge and work descriptions are versioned in Git. No implementation agent can mark work verified by changing a document status. There is no active autonomous feature loop yet.

The first POC uses one writer and serial integration; concurrency is a later design goal. Secrets, execution state and generated artifacts are not committed.
