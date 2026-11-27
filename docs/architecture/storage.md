# Storage and consistency

The first implementation uses **Git-backed documentation and work records** in the target repository. This is an explicit simplification, not an assumption that Git provides transactional scheduling.

For the POC, allow one active writer; record changes on a branch and integrate serially. The source revision defines the applicable documentation revision. Later parallel work must pin base commits, check for stale context and reconcile conflicts before acceptance.

Runtime logs, worktree artifacts and execution journals are not documentation; they must stay outside committed source. A database or durable engine may later be introduced for active task claims and recovery. That decision is not yet made.

Do not commit generated test receipts as a substitute for independent CI evidence. External effects and Git commits must be reconciled after crashes rather than blindly replayed.

## Accepted backend direction (2026-11-26)

[ADR-0005](../decisions/ADR-0005-agentctl-backend-adapters.md) retains agentctl and requires a modular adapter boundary. The default preserves current sequential repository-backed behaviour. Future parallel agents require shared persistence outside the repository; storage technology remains undecided, and optional adapters such as Notion are candidates rather than selected dependencies. Define concurrency capabilities and authority before enabling parallel claims.
