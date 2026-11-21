---
id: ADR-0002
type: adr
status: accepted
related:
  - PRD-0001
  - FLOW-001
supersedes: []
---

# ADR-0002: Ultracode orchestration for the first POC

## Context

Ultracode provides an existing Pi workflow mechanism and avoids immediately building a custom agent runtime.

## Decision

Use Ultracode as the initial orchestration engine for sequential agent execution. Define a narrow adapter boundary and prove deterministic gates, scoped execution and recovery in a later implementation task.

## Consequences

No duplicate bespoke scheduler in the scaffold. The CLI still owns project conventions and verification policy. Alternative runtimes such as Pi Durable or Herdr integrations remain future options, not current dependencies.
