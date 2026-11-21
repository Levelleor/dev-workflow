---
id: STORY-0001
type: story
status: proposed
parent: PRD-0001
depends_on: []
related:
  - ADR-0001
  - ADR-0003
---

# STORY-0001: Bootstrap an existing repository

## Goal

Provide a safe `dev-workflow init` command that sets up minimal repository templates without destructive overwrites.

## Scope

Detect Git root and existing `AGENTS.md` / `.agentctl` files; propose missing files from `templates/repository/`. Respect established documentation rather than moving it.

## Acceptance criteria (proposed)

- Fresh and existing repositories have distinguishable, non-destructive init behaviour.
- Re-running init is idempotent for an unchanged repository.
- Existing files are never overwritten without an explicit review or merge path.
- Unconfigured verification profiles cannot be mistaken for passing checks.

## Verification

Tests and a runnable command are not yet implemented. This story is **proposed, not ready or accepted**.
