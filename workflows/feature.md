---
id: FLOW-001
type: workflow
status: proposed
---

# Sequential feature workflow

Intended order:

1. **Specify:** an architect creates or refines an eligible task linked to product criteria.
2. **Ready:** check dependencies, approved scope and nonempty required verification profile.
3. **Implement:** launch one cheap worker against the pinned code and knowledge revision.
4. **Verify:** run trusted checks *outside the worker's authority* for the candidate revision.
5. **Repair:** if checks fail, return bounded diagnostics to the worker; escalate after the retry limit.
6. **Review:** use a separate read-only reviewer against the exact verified diff.
7. **Integrate:** serially incorporate accepted change; reconcile concurrent source or knowledge changes.
8. **Verify integration:** rerun required checks and record acceptance evidence.

The controller owns lifecycle transitions and receipts. A worker's declaration or document status edit cannot substitute for trusted evidence.

POC: one active writer, serial integration. Future work: independent worktrees with optimistic revision checks.

Status: **design only**. Ultracode workflow integration, state persistence and verification are not implemented.
