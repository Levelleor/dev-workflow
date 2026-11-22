import { join } from "node:path";
import { writeFileAtomically, type FileSystem } from "./fs.js";
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

function blockers(task: RecordEntry, all: Map<string, RecordEntry>): string[] {
  const reasons: string[] = [];
  if (task.metadata.blocked === true) reasons.push("Explicitly blocked");
  const parent = task.metadata.parent;
  if (typeof parent !== "string" || all.get(parent)?.type !== "prd") {
    reasons.push(`Missing PRD parent: ${String(parent ?? "(none)")}`);
  }
  for (const id of new Set([...identifiers(task.metadata.depends_on, "depends_on"), ...identifiers(task.metadata.blocked_by, "blocked_by")])) {
    if (id === task.id) { reasons.push("Task depends on itself"); continue; }
    const dependency = all.get(id);
    if (!dependency) reasons.push(`Missing dependency: ${id}`);
    else if (!done.has(dependency.status)) reasons.push(`Waiting for ${id} [${dependency.status}]`);
  }
  return reasons;
}

/** Priority 1 is highest; missing priority is 3. IDs break ties. */
function priority(task: RecordEntry): number {
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
    const reasons = blockers(task, all);
    if (reasons.length) blocked.push({ id: task.id, reasons });
    else ready.push(task);
  }
  if (!ready.length) {
    return { ok: false, code: "ALL_BLOCKED", message: "All pending tasks have unresolved blockers.", blocked };
  }
  ready.sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
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
  const reasons = blockers(task, all);
  if (reasons.length) {
    return { ok: false, code: "TASK_BLOCKED", message: `${id} has unresolved blockers.`, blocked: [{ id, reasons }] };
  }
  return { ok: true, task };
}

export function withTaskLock<T>(fs: FileSystem, root: string, action: () => T): T {
  const directory = join(root, ".agentctl", "runtime");
  const lock = join(directory, "task.lock");
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.mkdirSync(lock);
  } catch {
    throw new Error("Task operation is locked by another process. Only one local coordinator may claim or complete work at a time.");
  }
  try {
    return action();
  } finally {
    fs.rmdirSync(lock);
  }
}

function changeStatus(fs: FileSystem, record: RecordEntry, status: "in-progress" | "implemented"): void {
  const raw = fs.readFileSync(record.file, "utf8");
  const match = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/.exec(raw);
  if (!match) throw new Error(`Missing frontmatter for ${record.id}.`);
  const front = match[1];
  if (!/^status:\s*\S.*$/m.test(front)) throw new Error(`Missing status field in ${record.id}.`);
  const updated = front.replace(/^status:\s*\S.*$/m, `status: ${status}`) + raw.slice(front.length);
  writeFileAtomically(fs, record.file, updated);
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

export function claimTask(fs: FileSystem, root: string, id: string): ClaimResult {
  return withTaskLock(fs, root, () => {
    const choice = id === "next" ? selectNextTask(fs, root) : selectTaskById(fs, root, id);
    if (!choice.ok) return choice;
    // Claiming changes task state only. getcontext assembles the full assignment.
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

export function completeTask(fs: FileSystem, root: string, id?: string): RecordEntry {
  return withTaskLock(fs, root, () => {
    const task = activeTask(fs, root, id);
    changeStatus(fs, task, "implemented");
    return { ...task, status: "implemented", metadata: { ...task.metadata, status: "implemented" } };
  });
}
