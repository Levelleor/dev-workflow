# Architecture overview

## Accepted direction (2026-11-26)

The future orchestrator is a dedicated Pi extension using SDK sessions, not Ultracode. Pi is the conversational dashboard; deterministic workflow control, verification, selective model escalation and human approval are explicit responsibilities. agentctl remains the knowledge/data CLI with modular backends and a sequential default; future parallel features need shared persistence outside the repository. See [ADR-0004](../decisions/ADR-0004-pi-sdk-extension.md), [ADR-0005](../decisions/ADR-0005-agentctl-backend-adapters.md) and [ADR-0006](../decisions/ADR-0006-feature-quality-and-human-gates.md). No SDK implementation is claimed here. The Ultracode baseline remains on [ultracode-legacy](https://github.com/Levelleor/dev-workflow/tree/ultracode-legacy).

## Ownership boundaries

- **CLI:** implemented repository setup, knowledge records, config and local verification commands; retain as the knowledge/data interface.
- **Core package:** future portable agent policy and lifecycle contracts.
- **Pi SDK extension:** selected future orchestration; one deterministic sequencing authority. Existing Ultracode adapter is legacy.
- **Knowledge adapter:** default Git-backed sequential records; modular backend contracts and future shared external persistence.
- **Verification adapter:** trusted check definitions and evidence tied to the tested revision.
- **Transient runtime state:** local, ignored files now; storage design to be verified before implementation.

See [storage](storage.md), [orchestration](orchestration.md), and [packaging](packaging.md).

## Planned first loop

Specification → ready gate → implementation → verification → bounded repair → independent review → serial integration → post-integration verification.

The legacy Ultracode workflow implements a preliminary version of this loop; the SDK successor is not implemented. See [FLOW-001](../../workflows/feature.md).

## Self-hosting constraint

The root repository must use the same `.agentctl` contract and knowledge conventions as future target repositories, but source templates and the live configuration have different purposes. Template updates must not silently overwrite the live configuration.
