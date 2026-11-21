---
id: STORY-0001
type: story
status: implemented
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

A runnable TypeScript CLI and Vitest/memfs tests are implemented, alongside a CI workflow that builds, tests and smoke-tests the package. See [PR #1](https://github.com/Levelleor/dev-workflow/pull/1).

**Implementation status:** implemented and verified on the feature branch. Integration and release are tracked separately. Ultracode execution is explicitly outside this bootstrap story.
