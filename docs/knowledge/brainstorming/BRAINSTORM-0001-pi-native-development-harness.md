---
id: BRAINSTORM-0001
type: brainstorm
status: draft
created_at: 2026-11-26
related:
  - PRD-0001
  - ADR-0001
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - ADR-0006
---

# Pi-native development harness and cost-conscious execution

## Problem

The goal is reliable, high-standard feature delivery from idea to production with lower expensive-model token consumption, not another general-purpose coding assistant or task tracker. Small implementation models can edit and test competently but may need precise corrective guidance when reasoning, exploration or design stalls. The existing Ultracode workflow demonstrates deterministic sequencing and independent review, but its host bridge adds a layer between a sandboxed workflow VM and agentctl. Preserve the current implementation as the `ultracode-legacy` branch (baseline commit `2bcd840fdc3632ec6f93f75c0558b986c0f9182e`). This record synthesises the architecture discussion and owner decisions of 2026-11-26; it is not a transcript or a benchmark report.

## Ideas

### Interactive cockpit and native execution

- Keep Pi as the primary command centre: ordinary chat, exploration, architecture/planning agent or skill, questions before execution, existing skills/prompts/extensions, workflow launch and ongoing conversation while work runs.
- A dedicated dev-workflow Pi extension uses the Pi SDK to create and manage separate agent sessions. Initially use a TypeScript core inside the Pi process; avoid requiring a daemon, MCP server, RPC transport or separate agent runtime. Keep the core separable from the UI without prematurely implementing multiple runners.
- Give workflows independent role/model/thinking configuration, prompts, skills, tool permissions, budgets and workflow definitions; selectively reuse normal Pi resources. Main chat model is independent of worker models. Workflow syntax and configuration file layout remain undecided.
- Register native model-facing tools (MCP-like semantics without a separate server) and optional slash commands/keyboard controls backed by the same deterministic operations. Proposed capabilities: start/list/status/inspect, pause/resume/cancel, steer, request changes, approve, escalate, spawn specialist, knowledge search. Launch should return a run ID promptly rather than block chat until completion.
- Live Pi widgets/overlays can show phases, active agents, model/cost, logs, evidence, errors and cancellation; inspect sessions without indiscriminately injecting logs into the conversational context. Agent may ask about implementation details or relay the owner's feedback while a worker is active. Steering at safe execution boundaries, direct cancellation, and persisted checkpoints should be considered. Changes to approved requirements invalidate or reopen approval/evidence as appropriate.
- Treat human approval as deterministic and revision-bound even when initiated conversationally. The main agent may relay an explicitly authorised action, never manufacture approval. A direct UI/command path is useful but not the only interface. Whether PR approval, console approval or both is authoritative is open.

### Selective expensive intelligence

- Strong architect works with the human to clarify requirements, design a bounded plan and establish acceptance criteria. Separate planning from implementation; prepare independent acceptance scenarios before code when practical.
- Cheap implementer receives bounded task context, interfaces, relevant files, constraints, examples and concrete acceptance criteria; performs most edits, exploration and routine repairs.
- Strong supervisor diagnoses stalls or repeated failures and gives actionable repair instructions (root cause, files/symbols, constraints, expected behaviour); prefer returning work to the cheap implementer rather than immediately replacing it. A strong implementation model is the fallback when guidance is insufficient.
- Fresh independent strong reviewer evaluates the candidate against original requirements and verification evidence, not simply the supervisor's opinion. Reviewer can be read-only. Distinguish implementation guidance from final approval.
- Routing signals to explore: repeated identical failures, no meaningful diff, repetitive tool calls, scope violations, budget exhaustion, architectural blockers, verification/review findings. Start with simple bounded retry and cost limits; adaptive routing is an experiment, not a proven local improvement.
- Deterministic controller, not a manager LLM, owns sequencing, model selection policy, checks, retries, escalation and state transitions. No token expenditure for ordinary scheduling or compiler exit-code interpretation.

### Verification, human review and integration

- Suggested lifecycle: idea/planning -> human plan approval -> independent acceptance contract -> isolated implementation -> deterministic checks -> independent review -> final checks -> PR -> human validation -> integration/CI -> acceptance; deployment/smoke verification may follow. Exact workflow representation and deployment policy are not chosen.
- Every individual feature must advance through mandatory stages sequentially, including when separate features run concurrently. Rejected checks/review return to bounded repair; exhausted budgets or unsafe states escalate, never silently succeed.
- Execute mandatory type checks, lint, tests, build, feature acceptance and other repository-specific checks via trusted code; fail closed if required checks/evidence are absent. Distinguish ordinary worker-owned tests from protected acceptance tests. Do not let an implementer weaken the policy or grade itself.
- Proposed receipts bind tested source revision, contract and policy hashes, check results, review and human approval; changes invalidate affected evidence. Protect CI workflow definitions, verifier credentials and acceptance scenarios. Independent SDK sessions are not security sandboxes; actual privilege separation may require process/container or service boundaries.
- Distinguish implemented, verified, reviewed, published, merged and accepted. Do not mark a feature accepted simply because an agent reports completion or a PR publisher reports success. Verify real external effects; reconcile retries rather than blindly replaying.
- Human validation is required before integration to main, including parallel features. PRs are the preferred review surface to explore, with plan/review conversational interaction in Pi. Protected branches, required checks, stale-review handling and merge queues are potential enforcement mechanisms; do not choose exact approval surface yet.
- Later parallel features should use isolated worktrees, shared task claims, dependency-aware scheduling, recovery and serialized or otherwise conflict-safe integration against current main. Revalidate changed revisions/base when needed.

### agentctl and storage

- Retain agentctl as the CLI for knowledge/data management and structured low-token lookups, not as a competing general-purpose agent harness. Existing typed Markdown records, context assembly, field projections, knowledge queries, verification commands and task notes are valuable.
- Extract modular storage/backend contracts. Default backend continues current sequential repository-local behaviour; future shared backend keeps the database outside the source repository and supports cross-agent communication and persistence, transactional ownership/claims, recovery, concurrency, stable IDs and query semantics. SQL versus Markdown versus another technology is undecided.
- Consider adapter modules for other services (e.g. Notion) without coupling the core domain to their APIs. Capability differences matter: a knowledge-only adapter must not pretend to provide transactional scheduling. Avoid dual authoritative mutable state.
- Keep CLI use flexible: deterministic workflows may invoke required operations directly or through the CLI; agents may use agentctl for efficient filtered retrieval. External stores may make CLI/adapter access essential rather than direct file reads. Maintain one domain contract regardless of transport.
- Distinguish persistent project knowledge, task findings/handoffs, workflow state/event journal, verification evidence, individual Pi conversation files and transient in-memory session handles. Shared data does not automatically become LLM context; provide bounded retrieval and role-scoped writes.
- Beads is a useful reference or possible adapter for atomic claims, dependency graphs, leases/heartbeat/recovery, provenance, history, custom metadata, versioned JSON, bulk graph creation, ephemeral molecules and asynchronous CI/human gates. It does not itself launch models or run local verification; its formulas instantiate task graphs, not procedural implementation workflows. agentctl's native field selection and typed knowledge/context assembly have independent value. Do not adopt Beads wholesale or duplicate authoritative state merely to get parallelism.

### Alternatives and supporting research

- [Aider architect/editor](https://aider.chat/2024/09/26/architect.html): separate solution reasoning from routine editing.
- [Strong-weak collaboration for repo-level code generation](https://aclanthology.org/2025.emnlp-main.1043/): research on pipeline collaboration and context augmentation.
- [SWE-Router](https://arxiv.org/abs/2607.00053): progress-sensitive model routing; consider observed trajectory rather than fixed retries only.
- [Agentless](https://github.com/OpenAutoCoder/Agentless): localisation, repair and validation as explicit stages.
- [Anthropic long-running harness](https://www.anthropic.com/research/harness-design-long-running-apps) and [reference implementation](https://github.com/anthropics/cwc-long-running-agents): planner/generator/evaluator separation, evidence and fresh sessions.
- [StrongDM Software Factory](https://factory.strongdm.ai/): independent holdout acceptance scenarios; retain human review for this project.
- [OpenHands](https://github.com/OpenHands/software-agent-sdk): alternative agent execution SDK and layered critic/review/QA patterns.
- [Pi](https://github.com/earendil-works/pi): SDK sessions, extension tools/UI, RPC subprocesses. SDK is direct in-process library use; RPC is JSON over process transport. RPC may later improve crash isolation/termination, not model intelligence or security by itself.
- [Temporal](https://docs.temporal.io/): durable workflow history, activities/retries, signals and human waits; valuable if crash recovery and cross-process execution justify infrastructure. [Mastra](https://mastra.ai/): TypeScript agent/workflow framework with branching and suspend/resume. [Inngest](https://www.inngest.com/): event-driven durable steps/concurrency/waits. Compare against a simple TypeScript state machine plus local persistence; do not select any now.
- [Beads](https://github.com/gastownhall/beads): operational work graph, not the implementation controller. [Herdr](https://github.com/herdrdev/herdr): optional terminal workspace/agent visibility, not a required workflow runtime. Related packages to investigate: [pi-herdr](https://github.com/AndrewJacop/pi-herdr), [pi-herdr-workflow-kit](https://github.com/Jackliu-miaozi/pi-herdr-workflow-kit), [pi-herdr-agents](https://pi.dev/packages/%40casualjim/pi-herdr-agents), [herdr-orchestra](https://pi.dev/packages/herdr-orchestra), [pi-herdr-subagents](https://github.com/danenright/pi-herdr-subagents). These are leads, not audited dependencies.
- GitHub Actions/PR checks provide independent final enforcement; no need to invent all integration infrastructure.

### Cost and evaluation

Judge by cost per accepted feature rather than token price: total planning, implementation, supervision, review, retries and escalations divided by accepted outcomes; also measure defects, false reviewer approvals/rejections, elapsed time, human interventions and recovery. Compare strong-only, cheap-only, cheap+reviewer, cheap+supervisor, complete role separation and adaptive escalation on representative tasks. Published patterns are evidence for experimentation, not guarantees of savings in this repository.

## Ideas set aside and why

- Replacing Pi with a standalone controller UI: loses the existing chat, skills and seamless interactive workflow monitoring.
- Requiring Ultracode for future architecture: preserves useful POC ideas but adds VM/bridge coupling; keep the baseline as an archive.
- Implementing SDK, RPC, Herdr and Ultracode runners simultaneously: premature abstraction and maintenance cost. Begin with SDK, retain a clean boundary.
- Mandatory Herdr, Temporal, Mastra, Inngest or Beads: additional integration/packaging and operational complexity before a clear need; preserve as options.
- Bead per internal verification stage or autonomous LLM manager orchestrating everything: duplicate procedural flow and risk expensive coordination or premature stage completion. A feature-level controller owns the mandatory sequence.
- Free-form agent claims of success or purely prompt-enforced acceptance: not evidence or a reliable privilege boundary.

## Open questions

- Workflow language/format, extension configuration layout, packaging and distribution mechanism, portability tests across operating systems.
- Physical storage technology, backend capability contract, external shared-store lifecycle and optional adapters such as Notion.
- Whether agentctl operations are forced through subprocess CLI calls, native shared library methods or a mixture; how to preserve stable data access when storage moves outside the repository.
- Exact plan/review approval interface: PR, console, conversational confirmation, or combinations; how to authenticate approval and bind it to candidate revisions.
- Durable state/checkpoint and recovery mechanism, process isolation, cancellation semantics, costs and model-routing thresholds.
- How to preserve context/policy compatibility and migrate existing stories; how to handle parallel dependency and merge conflicts.
- Which acceptance tests are protected and how to validate real CI/PR outcomes; production deployment policy.
- Whether independent runtime, Herdr, RPC, Beads or a durable engine become justified by measured needs.

## Next steps

1. Preserve the legacy branch and accept the scoped architecture decisions in ADR-0004 through ADR-0006.
2. Prototype a Pi extension with concurrent main chat and one managed SDK worker, independent settings, events, steering/cancellation and nonblocking launch. Validate SDK version compatibility, resource loading and re-entrancy.
3. Extract reusable core and agentctl backend boundaries without changing current sequential storage behaviour; define backend capability tests.
4. Define feature acceptance/evidence lifecycle, human intervention and trusted verification. Decide workflow format and approval mechanism before implementation commitments that depend on them.
5. Benchmark guided cheap workers; add parallel isolated feature execution and external shared storage only after sequential correctness is demonstrated.
