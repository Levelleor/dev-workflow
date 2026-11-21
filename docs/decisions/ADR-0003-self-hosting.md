---
id: ADR-0003
type: adr
status: accepted
related:
  - PRD-0001
supersedes: []
---

# ADR-0003: One repository for the CLI, templates and its own harness instance

## Decision

`dev-workflow` is a monorepo for the future npm CLI, shared contracts, Pi agent role files, orchestration integration, reusable target-repository templates and the project's own work knowledge.

The repository uses its own versioned `.agentctl` and `AGENTS.md` conventions. The CLI is published independently; target repositories get templates and config, never copied CLI source.

## Consequences

The scaffold must keep source templates distinct from self-hosted live configuration and must never claim unimplemented workflow features are running.
