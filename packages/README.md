# Workspace packages

The root uses **npm workspaces**. All packages remain private during this scaffolding phase; no npm publication or executable CLI is implied.

| Directory | Intended responsibility |
| --- | --- |
| [`cli/`](cli/README.md) | The independently installable npm command, configuration UI and human-facing commands |
| [`core/`](core/README.md) | Shared types, lifecycle contracts, policy and configuration schemas |
| [`knowledge/`](knowledge/README.md) | Repository-backed records, ID/link validation and context assembly |
| [`verification/`](verification/README.md) | Trusted check profiles, receipts and verification adapters |
| [`runtime-ultracode/`](runtime-ultracode/README.md) | Adapter between the control-plane contracts and Ultracode |

Package boundaries are provisional; record a decision before coupling knowledge storage to runtime orchestration or duplicating a workflow scheduler.
