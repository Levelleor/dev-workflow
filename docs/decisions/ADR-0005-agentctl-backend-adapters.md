---
id: ADR-0005
type: adr
status: accepted
created_at: 2026-11-26
accepted_at: 2026-11-26
related:
  - PRD-0001
  - ADR-0001
  - ADR-0003
  - ADR-0004
  - BRAINSTORM-0001
supersedes: []
---

# ADR-0005: Preserve agentctl with modular data backend adapters

## Context

agentctl provides typed knowledge/work records, deterministic retrieval, field projection and verification capabilities. Repository-local Markdown supports the existing sequential flow but does not supply cross-worktree transactional claims or shared operational state. Future parallel agents need a shared persistence boundary. The owner approved this direction on 2026-11-26.

## Decision

- Retain agentctl as the CLI for knowledge and data-store operations. Introduce modular backend contracts with a default backend preserving the currently supported sequential behaviour.
- Support a future backend whose database is outside the repository, shared across agents/worktrees for communication, persistence and parallel coordination. The actual physical storage technology (SQL, Markdown or otherwise) remains undecided.
- Keep storage implementation behind adapters and stable domain/query contracts. Consider third-party adapters such as Notion; exact interface, required capabilities and integrations are open.
- CLI access may be a required deterministic workflow operation or an agent lookup helper to reduce token use. If records move outside the repository, controlled CLI/adapter access may be required for retrieval. The choice of subprocess CLI versus shared library calls is not yet made.
- Preserve stable record IDs and query/context semantics. Do not confuse shared persisted data with LLM context or promise concurrent safety from a backend lacking atomic claims/consistent updates.

## Consequences

ADR-0001 remains valid for the initial repository-backed milestone. The backend abstraction permits future evolution without forcing a database migration or choosing Beads, SQLite or Notion today. Parallel-capable backends will require explicit coordination, consistency, recovery and migration tests. Backend capabilities, authority and failure semantics must be documented; avoid two authoritative mutable copies.
