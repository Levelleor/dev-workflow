---
id: STORY-0002
type: story
status: proposed
parent: PRD-0001
priority: 4
depends_on: []
related: []
---

# STORY-0002: Monitor agentctl workflow progress in a TUI or web UI

## Goal

Provide a clear, read-only view into what a running or previously interrupted
agentctl/Ultracode workflow is doing, without having to inspect raw transcripts
or reconstruct its state from individual task files.

## Proposed scope

- Investigate extending Pi/Ultracode's existing `/workflows` TUI before
  introducing another interface or independent workflow coordinator.
- Show task/story ID, run ID, current phase (claim, implement, verify, repair,
  review, publish), running agent/model, attempt and review-round numbers.
- Display a chronological progress timeline with verification gate results,
  review findings, failures/blockers, and the published PR URL when present.
- Include elapsed time and token/cost metrics where the underlying runtime
  already exposes reliable data.
- Allow inspecting a completed or interrupted run and resuming the view after
  reopening Pi, using the existing journal or structured events.
- Evaluate an optional local web viewer once the event/state contract is stable.
- Make the UI read-only initially. Workflow cancellation, retries, approvals,
  and remote access are separate decisions.

## Acceptance criteria (for future refinement)

- A user can tell which stage is active, which agent is responsible, and what
  the workflow is waiting for without reading raw logs.
- Verification and review failures surface actionable diagnostics and retries
  in the correct chronological order.
- Current and completed runs are distinguishable; interruption does not
  produce a misleading success indicator.
- Displayed progress reflects the existing Ultracode journal/runtime rather
  than introducing a second orchestration source of truth.
- Sensitive environment values, credentials, and raw secrets never appear in
  the progress view.
- TUI versus web delivery is decided after evaluating existing Ultracode UI
  capabilities and the smallest useful event contract.

## Deferred

Proposed backlog only. Do not implement this UI or change runtime behaviour
until the first real end-to-end workflow has been tested.
