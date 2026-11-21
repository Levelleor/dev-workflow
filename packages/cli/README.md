# agentctl

**Status:** working CLI foundation for repository setup and knowledge records. Ultracode agent execution is not yet connected.

The npm package is `@levelleor/agentctl` and the executable is `agentctl`. The package remains `private: true` until publishing is approved. After publishing, `npx @levelleor/agentctl --help` will execute the packaged binary.

## Commands

```sh
agentctl init                   # install templates without overwriting files
agentctl doctor                 # inspect configuration readiness
agentctl status --json          # machine-readable project summary
agentctl knowledge add --type prd --title "My product"
agentctl work add --title "First feature" --parent PRD-0001
agentctl work list --json
agentctl knowledge capture "Research note" --source STORY-0001
agentctl config show
agentctl config get models.roles.worker.model
agentctl config set models.roles.worker.thinking low
agentctl verify --profile scaffold
```

Commands operate on the project containing the current working directory. `init` works in a new or existing directory; it creates only missing files and never overwrites an existing `AGENTS.md`, document or configuration file.

Record creation allocates stable IDs, validates required relationships and adds links to the relevant category index. Work items remain proposed until a later implementation of the workflow acceptance engine. `verify` executes configured local shell commands; it fails closed when a requested profile is missing or empty. It is **not yet an isolated, security-hardened verifier**, and it does not issue signed revision-bound acceptance receipts.

## Development

Requires Node.js 24 or newer. From the monorepo root:

```sh
npm install
npm run check
node packages/cli/dist/index.js --help
```

Unit tests use Vitest and memfs, injected into the CLI's filesystem interface; no real repositories or cloud services are touched.

The production CLI is built with TypeScript and includes its repository templates in `dist/templates/`. See [architecture](../../docs/architecture/overview.md).

## Sequential task workflow

```sh
agentctl task claim next                 # claim and output a complete prompt
agentctl task getcontext                 # rehydrate the in-progress task context
agentctl task complete                   # mark implemented, not accepted
agentctl task claim next --json          # structured context or diagnostic (exit code 2)
```

New stories start `pending`. Optional frontmatter includes `priority: 1` (highest) to `5` (lowest), `depends_on: [STORY-0001]`, and `blocked: true`. Claimed tasks become `in-progress`; `complete` changes the status to `implemented`. Proposed stories are not claimable. Dependencies count as resolved when implemented/completed/accepted.

`.agentctl/project.yaml` defines `context.include` for common project documents and `context.reference` for optional paths. The complete prompt embeds the story, parent PRD, relevant accepted decisions and active task plan where present. Missing essential context prevents claiming.

The repository's task Markdown is Git tracked. The process-level `.agentctl/runtime/task.lock` is ignored by Git and protects concurrent claims **within one working tree**. It does not coordinate separate worktrees, machines, or stale locks after crashes. The first Ultracode integration must retain the single-writer constraint until shared coordination is implemented.

Use `agentctl --help` for the complete command reference.
