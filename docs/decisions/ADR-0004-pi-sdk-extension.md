---
id: ADR-0004
type: adr
status: accepted
created_at: 2026-11-26
accepted_at: 2026-11-26
related:
  - PRD-0001
  - BRAINSTORM-0001
  - ADR-0003
supersedes:
  - ADR-0002
---

# ADR-0004: Pi-native development extension using the SDK

## Context

The Ultracode POC established a deterministic implementation/review loop, but dev-workflow needs its own policy and agent configuration while retaining Pi's conversational interface, existing ecosystem and live monitoring. A separate standalone dashboard or a mandatory VM bridge would add friction. The owner approved the SDK path on 2026-11-26.

## Decision

- Pi is the primary dashboard and command centre. Preserve normal conversation, architecture/planning interaction and questions before launch, including continued chat while workflows run.
- Implement a dedicated Pi extension using Pi SDK sessions to manage specialist agents. Own workflow-specific agents, prompts, skills, models, tools, settings and execution policy independently of the main session; reuse existing Pi resources selectively.
- The deterministic workflow controller owns lifecycle and sequencing; the main Pi agent receives native tools for launching, inspecting, steering, stopping and otherwise controlling workflows in response to the human. Expose equivalent direct controls and status/inspection UI where useful. Human intervention is first-class.
- Start with a portable TypeScript core embedded in the extension, not mandatory separate infrastructure. Design for future parallel feature/agent execution without implementing multiple runner backends prematurely.
- Preserve the Ultracode implementation as `ultracode-legacy` at `2bcd840fdc3632ec6f93f75c0558b986c0f9182e`. Supersede the Ultracode architecture choice for future development; do not remove the existing implementation merely by accepting this ADR.
- Prioritise simple, portable, installable cross-system packaging. Workflow format is explicitly undecided. Temporal, Mastra, Inngest, RPC, Herdr and other integrations remain optional research paths, not dependencies selected by this decision.

## Consequences

The extension owns the user experience and workflow policy; Pi supplies the agent engine. Prototype independent SDK sessions, nonblocking tool calls, live events, cancellation and steering before committing to detailed APIs. In-process sessions share process failure and privileges; they are not sandboxes. Durable recovery and privilege boundaries require explicit design. Existing implementation/backlog may still reference Ultracode until migrated; consult this decision for new work.
