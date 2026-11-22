# Workspace packages

The root uses **npm workspaces**. The `@levelleor/agentctl` CLI builds and runs, but packages remain private until npm publication is approved. Other workspace packages remain architectural placeholders.

| Directory | Intended responsibility |
| --- | --- |
| [`cli/`](cli/README.md) | The independently installable npm command, configuration UI and human-facing commands |
| [`core/`](core/README.md) | Shared types, lifecycle contracts, policy and configuration schemas |
| [`knowledge/`](knowledge/README.md) | Repository-backed records, ID/link validation and context assembly |
| [`verification/`](verification/README.md) | Trusted check profiles, receipts and verification adapters |
| [`pi-ultracode-agentctl-bridge/`](pi-ultracode-agentctl-bridge/README.md) | Scoped agentctl host capabilities registered with Ultracode |

Package boundaries are provisional; record a decision before coupling knowledge storage to runtime orchestration or duplicating a workflow scheduler.
