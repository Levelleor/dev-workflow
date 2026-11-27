---
id: ADR-0006
type: adr
status: accepted
created_at: 2026-11-26
accepted_at: 2026-11-26
related:
  - PRD-0001
  - ADR-0004
  - ADR-0005
  - BRAINSTORM-0001
supersedes: []
---

# ADR-0006: Cost-conscious feature execution and mandatory human validation

## Context

The harness has two primary objectives: reliable feature implementation to high standards and lower expensive-model token consumption. Cheap workers often need targeted direction rather than full replacement by a stronger model. Parallelism must not weaken feature-specific vetting. The owner confirmed these objectives and human validation on 2026-11-26.

## Decision

- Keep each feature's implementation and vetting strictly sequenced by deterministic policy, even when multiple features run concurrently. Plan and establish requirements before implementation; allow human participation in planning and review.
- Use inexpensive models where practical and reserve stronger reasoning for planning, diagnosing/guiding stalled workers, independent review and escalation. Prefer bounded, evidence-driven repair; exact model/routing and retry rules remain configurable and subject to evaluation.
- Require applicable deterministic checks and independent evaluation before advancing to acceptance. A worker's completion claim is insufficient; distinguish implementation from verification, publication and integration.
- Human validation is mandatory before integration into main, including parallel flows. Treat approval, rejection, changes, cancellation and steering as first-class deterministic operations accessible through Pi, including conversational requests. Approval must represent actual human authority, not a model assertion.
- PR-based review is a preferred candidate for human validation; whether PR approval, console approval or both are required is explicitly undecided. Do not treat this preference as a final approval-mechanism selection.

## Consequences

Future implementation must prevent bypassing mandatory checks or accepting stale evidence; revision-bound contracts/receipts, protected acceptance checks, constrained worker credentials, CI enforcement and conflict-safe integration are design options described in BRAINSTORM-0001. Parallel feature work should retain isolated workspaces and safe integration. Measure quality and cost per accepted feature; no savings or reliability claims are established by this ADR alone.
