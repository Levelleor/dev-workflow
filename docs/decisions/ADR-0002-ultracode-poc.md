---
id: ADR-0002
type: adr
status: superseded
related:
  - PRD-0001
  - FLOW-001
supersedes: []
---

# ADR-0002: Ultracode orchestration for the first POC

Superseded for future development by [ADR-0004](ADR-0004-pi-sdk-extension.md) on 2026-11-26. The original implementation is preserved on [ultracode-legacy](https://github.com/Levelleor/dev-workflow/tree/ultracode-legacy). Historical decision text follows.

## Context

Ultracode provides an existing Pi workflow mechanism and avoids immediately building a custom agent runtime.

## Decision

Use Ultracode as the initial orchestration engine for sequential agent execution. Define a narrow adapter boundary and prove deterministic gates, scoped execution and recovery in a later implementation task.

## Consequences

No duplicate bespoke scheduler in the scaffold. The CLI still owns project conventions and verification policy. Alternative runtimes such as Pi Durable or Herdr integrations remain future options, not current dependencies.
