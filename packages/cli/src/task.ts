import { isAlias, isScalar } from "yaml";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { listGates, runGates, type Gate, type RunCommand, type VerifyResult } from "./verify.js";
import { withRecordLock, writeFileAtomically, type FileSystem } from "./fs.js";
import { readFrontmatter } from "./frontmatter.js";
import { listRecords, type RecordEntry } from "./records.js";
import { buildTaskContext, type TaskContext } from "./context.js";

const available = new Set(["pending", "ready"]);
const done = new Set(["implemented", "accepted", "completed"]);

export type BlockedTask = { id: string; reasons: string[] };
export type TaskSelection =
  | { ok: true; task: RecordEntry }
  | { ok: false; code: string; message: string; blocked: BlockedTask[] };

function identifiers(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Expected an array of IDs in ${field}.`);
  }
  return value;
}

export function taskDependencyIds(task: RecordEntry): string[] {
  return [...new Set([...identifiers(task.metadata.depends_on, "depends_on"), ...identifiers(task.metadata.blocked_by, "blocked_by")])];
}

export function taskBlockers(task: RecordEntry, all: ReadonlyMap<string, RecordEntry>): string[] {
  const reasons: string[] = [];
  if (task.metadata.blocked === true) reasons.push("Explicitly blocked");
  const parent = task.metadata.parent;
  if (typeof parent !== "string" || all.get(parent)?.type !== "prd") {
    reasons.push(`Missing PRD parent: ${String(parent ?? "(none)")}`);
  }
  for (const id of taskDependencyIds(task)) {
    if (id === task.id) { reasons.push("Task depends on itself"); continue; }
    const dependency = all.get(id);
    if (!dependency) reasons.push(`Missing dependency: ${id}`);
    else if (!done.has(dependency.status)) reasons.push(`Waiting for ${id} [${dependency.status}]`);
  }
  return reasons;
}

/** Priority 1 is highest; missing priority is 3. IDs break ties. */
export function taskPriority(task: RecordEntry): number {
  const value = task.metadata.priority;
  if (value === undefined) return 3;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`Invalid priority for ${task.id}; expected an integer from 1 to 5.`);
  }
  return value;
}

export function selectNextTask(fs: FileSystem, root: string): TaskSelection {
  const stories = listRecords(fs, root, "story");
  const ids = new Set<string>();
  for (const task of stories) {
    if (ids.has(task.id)) {
      return {
        ok: false, code: "DUPLICATE_TASK_ID",
        message: `Multiple task records have ID ${task.id}. Resolve the duplicate before claiming.`, blocked: [],
      };
    }
    ids.add(task.id);
  }
  const active = stories.filter((task) => task.status === "in-progress");
  if (active.length) {
    return {
      ok: false, code: "TASK_IN_PROGRESS",
      message: `${active.map((task) => task.id).join(", ")} already in progress. Use 'agentctl task getcontext' or 'agentctl task complete'.`,
      blocked: [],
    };
  }
  const candidates = stories.filter((task) => available.has(task.status));
  if (!candidates.length) {
    const proposed = stories.filter((task) => task.status === "proposed").length;
    return {
      ok: false, code: proposed ? "NO_READY_TASKS" : "NO_PENDING_TASKS",
      message: proposed
        ? `No pending/ready tasks. ${proposed} proposed task(s) must be made pending before claiming.`
        : "No pending/ready tasks remain.",
      blocked: [],
    };
  }
  const all = new Map(listRecords(fs, root).map((record) => [record.id, record]));
  const blocked: BlockedTask[] = [];
  const ready: RecordEntry[] = [];
  for (const task of candidates) {
    const reasons = taskBlockers(task, all);
    if (reasons.length) blocked.push({ id: task.id, reasons });
    else ready.push(task);
  }
  if (!ready.length) {
    return { ok: false, code: "ALL_BLOCKED", message: "All pending tasks have unresolved blockers.", blocked };
  }
  ready.sort((a, b) => taskPriority(a) - taskPriority(b) || a.id.localeCompare(b.id));
  return { ok: true, task: ready[0] };
}

/** An explicit claim bypasses queue priority, never eligibility or ownership rules. */
export function selectTaskById(fs: FileSystem, root: string, id: string): TaskSelection {
  if (!/^STORY-\d{4,}$/.test(id)) {
    return { ok: false, code: "INVALID_TASK_ID", message: `Expected a stable task ID such as STORY-0001, got '${id}'.`, blocked: [] };
  }
  const stories = listRecords(fs, root, "story");
  const active = stories.filter((task) => task.status === "in-progress");
  if (active.length) {
    return {
      ok: false, code: "TASK_IN_PROGRESS",
      message: `${active.map((task) => task.id).join(", ")} already in progress. Use 'agentctl task getcontext' or 'agentctl task complete'.`,
      blocked: [],
    };
  }
  const matches = stories.filter((task) => task.id === id);
  if (matches.length > 1) {
    return { ok: false, code: "DUPLICATE_TASK_ID", message: `Multiple task records have ID ${id}. Resolve the duplicate before claiming.`, blocked: [] };
  }
  const task = matches[0];
  if (!task) {
    return { ok: false, code: "UNKNOWN_TASK", message: `No task with ID ${id} exists.`, blocked: [] };
  }
  if (!available.has(task.status)) {
    return {
      ok: false, code: "TASK_NOT_READY",
      message: `${id} has status '${task.status}', not pending or ready.`,
      blocked: [],
    };
  }
  const all = new Map(listRecords(fs, root).map((record) => [record.id, record]));
  const reasons = taskBlockers(task, all);
  if (reasons.length) {
    return { ok: false, code: "TASK_BLOCKED", message: `${id} has unresolved blockers.`, blocked: [{ id, reasons }] };
  }
  return { ok: true, task };
}

function changeStatus(fs: FileSystem, record: RecordEntry, status: "in-progress" | "implemented"): void {
  const raw = fs.readFileSync(record.file, "utf8");
  const parsed = readFrontmatter(raw);
  if (!parsed) throw new Error(`Missing frontmatter for ${record.id}.`);
  const field = parsed.document.get("status", true);
  if ((!isScalar(field) && !isAlias(field)) || !field.range) throw new Error(`Missing status field in ${record.id}.`);
  const start = parsed.start + field.range[0];
  const end = parsed.start + field.range[1];
  const newline = /\r?\n$/.exec(raw.slice(start, end))?.[0] ?? "";
  writeFileAtomically(fs, record.file, raw.slice(0, start) + status + newline + raw.slice(end));
}

function activeTask(fs: FileSystem, root: string, id?: string): RecordEntry {
  const active = listRecords(fs, root, "story").filter((task) => task.status === "in-progress");
  const selected = id ? active.find((task) => task.id === id) : active.length === 1 ? active[0] : undefined;
  if (!selected) {
    if (!active.length) throw new Error("No task is in progress. Use 'agentctl task claim next'.");
    throw new Error(id ? `Task ${id} is not in progress.` : "Multiple tasks are in progress. Specify a task ID.");
  }
  return selected;
}

export type ClaimResult =
  | { ok: true; task: { id: string; title: string; status: "in-progress" } }
  | Extract<TaskSelection, { ok: false }>;

type ClaimBaseline = { id: string; nonce: string; gates: Gate[] };

function baselinePath(root: string): string {
  return join(root, ".agentctl", "runtime", "task-claim.json");
}

function checksPath(root: string): string {
  return join(root, ".agentctl", "checks.yaml");
}

function readBaseline(raw: string, id: string): ClaimBaseline {
  const value = JSON.parse(raw) as ClaimBaseline;
  if (!value || value.id !== id || typeof value.nonce !== "string" || !value.nonce ||
      !Array.isArray(value.gates) || value.gates.some((gate) =>
        !gate || typeof gate.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(gate.name) ||
        typeof gate.command !== "string" || !gate.command.trim() ||
        !Number.isInteger(gate.timeoutSeconds) || gate.timeoutSeconds < 1) ||
      new Set(value.gates.map((gate) => gate.name)).size !== value.gates.length) {
    throw new Error("Invalid or mismatched claim-time verification baseline.");
  }
  return value;
}

export function claimTask(fs: FileSystem, root: string, id: string): ClaimResult {
  return withRecordLock(fs, root, () => {
    const choice = id === "next" ? selectNextTask(fs, root) : selectTaskById(fs, root, id);
    if (!choice.ok) return choice;
    // Persist the baseline before claiming; a failed status write leaves only an
    // orphan snapshot, which the next successful claim replaces under this lock.
    const baseline: ClaimBaseline = { id: choice.task.id, nonce: randomUUID(), gates: listGates(fs, root) };
    writeFileAtomically(fs, baselinePath(root), JSON.stringify(baseline));
    changeStatus(fs, choice.task, "in-progress");
    return {
      ok: true,
      task: { id: choice.task.id, title: choice.task.title, status: "in-progress" },
    };
  });
}

export function claimNextTask(fs: FileSystem, root: string): ClaimResult {
  return claimTask(fs, root, "next");
}

export function getActiveTaskContext(fs: FileSystem, root: string, id?: string): TaskContext {
  return buildTaskContext(fs, root, activeTask(fs, root, id));
}

export type CompletionResult =
  | { ok: true; id: string; status: "implemented"; verification: VerifyResult }
  | { ok: false; id: string; status?: "in-progress"; code: string; message: string; verification?: VerifyResult };

function refusal(id: string, code: string, message: string, verification?: VerifyResult): Extract<CompletionResult, { ok: false }> {
  return { ok: false, id, status: "in-progress", code, message, ...(verification ? { verification } : {}) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function completeTask(fs: FileSystem, root: string, id?: string, runner?: RunCommand): CompletionResult {
  // Do not hold the record lock while executing arbitrary project commands.
  const attempt = withRecordLock<Extract<CompletionResult, { ok: false }> | {
    task: RecordEntry; baselineRaw: string; configRaw: string; gates: Gate[]; taskRaw: string;
  }>(fs, root, () => {
    const task = activeTask(fs, root, id);
    try {
      if (!fs.existsSync(baselinePath(root))) {
        return refusal(task.id, "MISSING_BASELINE",
          "Missing claim-time verification baseline. Have the coordinator review policy and re-claim the task.");
      }
      const baselineRaw = fs.readFileSync(baselinePath(root), "utf8");
      const baseline = readBaseline(baselineRaw, task.id);
      const configRaw = fs.readFileSync(checksPath(root), "utf8");
      const gates = listGates(fs, root);
      if (fs.readFileSync(checksPath(root), "utf8") !== configRaw) {
        return refusal(task.id, "VERIFICATION_POLICY_CHANGED", "Verification configuration changed while preparing completion.");
      }
      for (const original of baseline.gates) {
        const current = gates.find((gate) => gate.name === original.name);
        if (!current || current.command !== original.command || current.timeoutSeconds < original.timeoutSeconds) {
          return refusal(task.id, "VERIFICATION_POLICY_CHANGED", `Claim-time gate '${original.name}' was removed or weakened.`);
        }
      }
      if (!gates.length) return refusal(task.id, "VERIFICATION_UNCONFIGURED", "No verification gates registered. Use 'agentctl verify add'.");
      return { task, baselineRaw, configRaw, gates, taskRaw: fs.readFileSync(task.file, "utf8") };
    } catch (error) {
      return refusal(task.id, "VERIFICATION_CONFIG_ERROR", errorMessage(error));
    }
  });
  if ("ok" in attempt) return attempt;

  let verification: VerifyResult;
  try {
    verification = runGates(root, attempt.gates, runner);
  } catch (error) {
    return refusal(attempt.task.id, "VERIFICATION_EXECUTION_ERROR", errorMessage(error));
  }
  if (!verification.passed) {
    return refusal(attempt.task.id, "VERIFICATION_FAILED", "One or more verification gates failed.", verification);
  }
  return withRecordLock<CompletionResult>(fs, root, () => {
    try {
      const current = activeTask(fs, root, attempt.task.id);
      if (current.file !== attempt.task.file ||
          fs.readFileSync(current.file, "utf8") !== attempt.taskRaw ||
          fs.readFileSync(baselinePath(root), "utf8") !== attempt.baselineRaw ||
          fs.readFileSync(checksPath(root), "utf8") !== attempt.configRaw) {
        return refusal(attempt.task.id, "COMPLETION_STATE_CHANGED",
          "Task, claim or verification configuration changed during verification. Retry completion.", verification);
      }
      changeStatus(fs, current, "implemented");
      return { ok: true, id: current.id, status: "implemented", verification };
    } catch (error) {
      return { ok: false, id: attempt.task.id, code: "COMPLETION_STATE_CHANGED",
        message: errorMessage(error), verification };
    }
  });
}
