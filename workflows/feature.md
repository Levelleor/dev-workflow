---
id: FLOW-001
type: workflow
status: implemented
---

# Sequential Ultracode feature workflow

Run `agentctl-sequential-feature` from Pi's `workflow` tool. The matching script is installed at `.pi/ultracode/workflows/agentctl-sequential-feature.workflow.js`. A trusted host extension `pi-ultracode-agentctl-bridge` supplies exactly three scoped capabilities.

1. Claim the highest priority eligible story, or a supplied ID, **deterministically** through `agentctl.write`. The response contains only task metadata; no agent arbitrates eligibility.
2. Call `agentctl.read` with `op: "snapshot"` and the claimed task ID, retrieving task context and baseline gates in one read-only CLI invocation. A cheap lookup subagent summarizes that context without modifying files. A fresh cheap implementation subagent receives the full task prompt plus lookup notes.
3. Implementation agent writes code and tests, registers additional quality gates if necessary, and returns. It **never** marks the task implemented.
4. The workflow calls `agentctl.verify` to run **all gates deterministically**. `repairRetries` in the workflow controls additional attempts after the first cheap implementation. The last retry escalates to the stronger model; earlier retries remain cheap. With the default of 2, there is one cheap repair and one strong attempt. If checks still fail, stop with full diagnostics.
5. After passing gates, a fresh **read-only** review subagent checks functional criteria, regressions, code quality, edge cases and security.
6. If review rejects, append task feedback and restart implementation. `reviewRetries` in the workflow controls additional review rounds; the default of 2 allows **three total review rounds**. Each round follows the configured repair budget.
7. If review approves, rerun gates, append review notes, mark the task `implemented` using the bridge and ask a publication agent to open a PR. Never merge it automatically. If publication fails, return `publish-blocked` and details.
8. If review rejects three times, gates fail after escalation or the integrity of existing gates is weakened, stop and report to the invoking user. The story remains `in-progress` except after successful approval.

Role `model` and `thinking` choices are declared in the Ultracode workflow rather than `agentctl`. Either may be omitted: no `thinking` suffix inherits the role/Pi effort; no model override inherits the selected Pi model. The initial POC has one writer in a single working tree. Cross-worktree claiming, hard security isolation of test commands and remote PR credentials are separate integration concerns. Ultracode's journal is required for mutating host calls.
