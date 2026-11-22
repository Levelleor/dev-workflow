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
agentctl config set models.roles.worker.thinking high
agentctl verify                          # run all registered gates
agentctl verify list                     # list gates and commands
agentctl verify scaffold                 # run only the scaffold gate
agentctl verify add unit -- npm test     # register a new gate (no overwrites)
agentctl verify add browser --timeout 600 -- npx playwright test
agentctl verify --profile scaffold       # legacy named profile
```

Commands operate on the project containing the current working directory. `init` works in a new or existing directory; it creates only missing files and never overwrites an existing `AGENTS.md`, document or configuration file.

Record creation allocates stable IDs, validates required relationships and adds links to the relevant category index. New stories begin pending. Verification executes registered shell commands but is **not yet an isolated, security-hardened acceptance verifier** and does not issue signed revision-bound receipts.

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
agentctl task claim next                 # select by priority and return claimed task metadata
agentctl task claim STORY-0001 --json    # explicitly claim a task by stable ID; JSON contains task ID/status
agentctl task getcontext STORY-0001      # assemble full context for the claimed task
agentctl task snapshot STORY-0001 --json  # task context, models and verification gates in one read
agentctl task complete STORY-0001        # mark that task implemented, not accepted
```

Task IDs are canonical identifiers such as `STORY-0001`, not file names. All task commands use the same positional ID format; `getcontext` and `complete` may omit the ID when exactly one task is active. `claim next` selects by priority, while `claim STORY-0001` deliberately chooses that specific task and still enforces dependencies, status and single-task ownership.

New stories start `pending`. Optional frontmatter includes `priority: 1` (highest) to `5` (lowest), `depends_on: [STORY-0001]`, and `blocked: true`. Claimed tasks become `in-progress`; `complete` changes the status to `implemented`. Proposed stories are not claimable. Dependencies count as resolved when implemented/completed/accepted.

`.agentctl/project.yaml` defines `context.include` for common project documents and `context.reference` for optional paths. The complete prompt embeds the story, parent PRD, relevant accepted decisions and active task plan where present. Missing essential context makes `getcontext` or `snapshot` fail, but the claim remains in-progress; correct the missing document and retry with the same ID. `snapshot` returns the task context, validated `.agentctl/models.yaml` policy and current verification gates without executing them or changing task state.

The repository's task Markdown is Git tracked. The process-level `.agentctl/runtime/task.lock` is ignored by Git and protects concurrent claims **within one working tree**. It does not coordinate separate worktrees, machines, or stale locks after crashes. The first Ultracode integration must retain the single-writer constraint until shared coordination is implemented.

Use `agentctl --help` for the complete command reference.


## Verification gates

Each gate is a named command in `.agentctl/checks.yaml`, independent of the project's language or test framework. The gate succeeds only with exit code 0. `agentctl verify` executes **all** registered gates, in name order, collecting failures rather than stopping at the first. `agentctl verify <name>` executes one gate; `agentctl verify list` lists them. Existing `--profile <name>` selections continue to work.

Register a gate with `agentctl verify add <name> [--timeout SECONDS] -- <command> [args...]`. The `--` delimiter preserves command options. Existing gates cannot be overwritten by this command. Changes are Git-tracked and should be reviewed because registered shell commands run with the invoking user's privileges. There is no gate removal or modification command in this milestone.

Use `--json` for machine-readable receipts containing exit codes, elapsed time, bounded stdout/stderr and timeout state. CLI exit code is 1 when any selected gate fails or configuration is invalid. No gates is an error for `verify`, not a pass.

## Task notes

```sh
agentctl task notes add "Investigate timeout"             # current in-progress story
agentctl task notes list
agentctl task notes remove N001
agentctl task STORY-0002 notes add "Investigate timeout"  # explicit story
agentctl task STORY-0002 notes list --json
```

Notes live in the task Markdown under `## Notes` with IDs `N001`, `N002`, etc. IDs are never reused after deletion. They can be accessed on a particular task even when it is not in progress. Without a task ID, exactly one task must be in progress. Since notes are part of the task document, `task getcontext` includes them automatically.

Task-specific notes are distinct from `knowledge capture`, which records wider discoveries in the knowledge inbox.
