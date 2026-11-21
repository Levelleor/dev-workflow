# Orchestration boundary

**Ultracode is the initial execution engine**, per [ADR-0002](../decisions/ADR-0002-ultracode-poc.md).

Intended responsibility split:

- CLI and policy layer define task contracts, required checks, model and budget policy.
- Ultracode owns agent invocation, workflow composition and worker execution.
- A trusted verifier, not a worker prompt, determines command-level check results.
- The integration policy compares the candidate against current accepted source/knowledge revisions.

Before implementing the adapter, prove that a predetermined sequence can be initiated and observed without asking a model to decide which gate runs next; verify restart semantics and worktree process isolation.

Do not confuse Git worktree isolation with security sandboxing. Model credentials, trusted policy, and release privileges must be inaccessible to untrusted workers.
