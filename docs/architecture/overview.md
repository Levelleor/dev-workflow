# Architecture overview

## Ownership boundaries

- **CLI and core packages:** future developer interface and portable policies, published separately.
- **Ultracode runtime adapter:** selected POC orchestration; must not share sequencing authority with a second scheduler.
- **Knowledge adapter:** Git-backed source-coupled requirements, ADRs, plans and work definitions.
- **Verification adapter:** trusted check definitions and evidence tied to the tested revision.
- **Transient runtime state:** local, ignored files now; storage design to be verified before implementation.

See [storage](storage.md), [orchestration](orchestration.md), and [packaging](packaging.md).

## Planned first loop

Specification → ready gate → implementation → verification → bounded repair → independent review → serial integration → post-integration verification.

No runner currently implements this sequence. See [FLOW-001](../../workflows/feature.md).

## Self-hosting constraint

The root repository must use the same `.agentctl` contract and knowledge conventions as future target repositories, but source templates and the live configuration have different purposes. Template updates must not silently overwrite the live configuration.
