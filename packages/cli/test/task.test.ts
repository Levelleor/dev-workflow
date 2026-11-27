import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { addGate, type RunCommand } from "../src/verify.js";

const green: RunCommand = () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 });
import { addRecord, findRecord } from "../src/records.js";
import { claimNextTask, claimTask, completeTask, getActiveTaskContext, selectNextTask, selectTaskById } from "../src/task.js";

function setup() {
  const { fs, initialize } = fixture();
  initialize();
  const prd = addRecord(fs, "/repo", { type: "prd", title: "Deliver useful software" });
  return { fs, prd };
}

function modify(fs: ReturnType<typeof setup>["fs"], file: string, from: string, to: string) {
  const text = fs.readFileSync(file, "utf8");
  expect(text).toContain(from);
  fs.writeFileSync(file, text.replace(from, to));
}

describe("deterministic task claiming", () => {
  it("prioritises ready tasks, returns only metadata, and loads context separately", () => {
    const { fs, prd } = setup();
    const lower = addRecord(fs, "/repo", { type: "story", title: "Second task", parent: prd.id });
    const higher = addRecord(fs, "/repo", { type: "story", title: "First task", parent: prd.id });
    modify(fs, higher.file, "priority: 3", "priority: 1");
    const result = claimNextTask(fs, "/repo");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Claim rejected");
    expect(result).toEqual({ ok: true, task: { id: higher.id, title: "First task", status: "in-progress" } });
    const context = getActiveTaskContext(fs, "/repo", higher.id);
    expect(context.task.id).toBe(higher.id);
    expect(context.prompt).toContain("Project agents");
    expect(context.prompt).toContain("npm test");
    expect(context.prompt).toContain("Deliver useful software");
    expect(context.prompt).toContain("First task");
    expect(context.prompt).toContain("Status: in-progress.");
    expect(context.prompt).not.toContain("Project:");
    expect(findRecord(fs, "/repo", higher.id).status).toBe("in-progress");
    expect(fs.existsSync(`${higher.file}.agentctl.tmp`)).toBe(false);
    expect(selectNextTask(fs, "/repo")).toMatchObject({ ok: false, code: "TASK_IN_PROGRESS" });
    expect(getActiveTaskContext(fs, "/repo").task.id).toBe(higher.id);
    const completed = completeTask(fs, "/repo", undefined, green);
    expect(completed.status).toBe("implemented");
    expect(findRecord(fs, "/repo", higher.id).status).toBe("implemented");
    expect(() => completeTask(fs, "/repo")).toThrow(/No task is in progress/);
    const next = claimNextTask(fs, "/repo");
    expect(next.ok && next.task.id).toBe(lower.id);
  });

  it("sorts ties by stable ID rather than filenames", () => {
    const { fs, prd } = setup();
    const first = addRecord(fs, "/repo", { type: "story", title: "Zebra", parent: prd.id });
    addRecord(fs, "/repo", { type: "story", title: "Apple", parent: prd.id });
    const result = selectNextTask(fs, "/repo");
    expect(result.ok && result.task.id).toBe(first.id);
  });

  it("does not claim blocked work and describes every blocker", () => {
    const { fs, prd } = setup();
    const dep = addRecord(fs, "/repo", { type: "story", title: "Prerequisite", parent: prd.id });
    const next = addRecord(fs, "/repo", { type: "story", title: "Depends on another", parent: prd.id });
    modify(fs, next.file, "depends_on: []", `depends_on: [${dep.id}]`);
    modify(fs, dep.file, "status: pending", "status: implemented");
    const claimed = claimNextTask(fs, "/repo");
    expect(claimed.ok && claimed.task.id).toBe(next.id);
    if (!claimed.ok) throw new Error("Expected a claim");
    expect(getActiveTaskContext(fs, "/repo", next.id).references.some((r) => r.includes(dep.id))).toBe(true);
  });

  it("explains an entirely blocked queue", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Blocked", parent: prd.id });
    modify(fs, story.file, "depends_on: []", "depends_on: [STORY-9999]");
    const result = selectNextTask(fs, "/repo");
    expect(result).toMatchObject({ ok: false, code: "ALL_BLOCKED" });
    if (result.ok) throw new Error("Expected blockers");
    expect(result.blocked[0].reasons).toEqual(expect.arrayContaining([expect.stringContaining("STORY-9999")]));
    expect(findRecord(fs, "/repo", story.id).status).toBe("pending");
  });

  it("distinguishes no tasks from proposed tasks", () => {
    const { fs, prd } = setup();
    expect(selectNextTask(fs, "/repo")).toMatchObject({ ok: false, code: "NO_PENDING_TASKS" });
    const story = addRecord(fs, "/repo", { type: "story", title: "Waiting for approval", parent: prd.id });
    modify(fs, story.file, "status: pending", "status: proposed");
    expect(selectNextTask(fs, "/repo")).toMatchObject({ ok: false, code: "NO_READY_TASKS" });
  });

  it("rejects conflicting claims while the lock exists", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Isolated", parent: prd.id });
    const dir = "/repo/.agentctl/runtime/task.lock";
    fs.mkdirSync(dir, { recursive: true });
    expect(() => claimNextTask(fs, "/repo")).toThrow(/locked by another process/);
    expect(findRecord(fs, "/repo", story.id).status).toBe("pending");
    fs.rmdirSync(dir);
    expect(claimNextTask(fs, "/repo").ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("claims independently of missing context; getcontext reports the missing document", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Requires context", parent: prd.id });
    fs.writeFileSync("/repo/.agentctl/project.yaml", "schemaVersion: 1\ncontext:\n  include: [docs/missing.md]\n");
    expect(claimNextTask(fs, "/repo")).toMatchObject({
      ok: true, task: { id: story.id, status: "in-progress" },
    });
    expect(() => getActiveTaskContext(fs, "/repo", story.id)).toThrow(/Required context document is missing/);
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
    expect(fs.existsSync("/repo/.agentctl/runtime/task.lock")).toBe(false);
  });

  it("includes accepted decisions and matching active plans but not proposed decisions", () => {
    const { fs, prd } = setup();
    const decision = addRecord(fs, "/repo", { type: "adr", title: "Build with TS" });
    const proposed = addRecord(fs, "/repo", { type: "adr", title: "Unreviewed approach" });
    modify(fs, decision.file, "status: proposed", "status: accepted");
    const story = addRecord(fs, "/repo", { type: "story", title: "Task with design", parent: prd.id, related: [decision.id, proposed.id] });
    fs.mkdirSync("/repo/docs/work/plans", { recursive: true });
    fs.writeFileSync("/repo/docs/work/plans/implementation.md", `---\nparent: ${story.id}\nstatus: active\n---\n# Focused plan\n`);
    const claimed = claimNextTask(fs, "/repo");
    expect(claimed.ok).toBe(true);
    const context = getActiveTaskContext(fs, "/repo", story.id);
    expect(context.prompt).toContain("Build with TS");
    expect(context.prompt).toContain("Focused plan");
    expect(context.prompt).not.toContain("# Unreviewed approach");
    expect(context.references).toContain("docs/decisions/" + proposed.id + "-unreviewed-approach.md");
  });

  it("lists linked research and brainstorming as optional task references", () => {
    const { fs, prd } = setup();
    const research = addRecord(fs, "/repo", { type: "research", title: "Queries considered" });
    const brainstorm = addRecord(fs, "/repo", { type: "brainstorm", title: "Possible designs" });
    const story = addRecord(fs, "/repo", {
      type: "story", title: "Build an index", parent: prd.id, related: [research.id, brainstorm.id],
    });
    expect(claimNextTask(fs, "/repo").ok).toBe(true);
    const context = getActiveTaskContext(fs, "/repo", story.id);
    expect(context.references).toEqual(expect.arrayContaining([
      research.file.slice("/repo/".length), brainstorm.file.slice("/repo/".length),
    ]));
    expect(context.prompt).not.toContain("# Queries considered");
    expect(context.prompt).not.toContain("# Possible designs");
  });

  it("does not truncate a record if a leftover temporary file prevents the update", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Crash protection", parent: prd.id });
    fs.writeFileSync(`${story.file}.agentctl.tmp`, "Unfinished previous write");
    expect(() => claimNextTask(fs, "/repo")).toThrow();
    expect(findRecord(fs, "/repo", story.id).status).toBe("pending");
    expect(fs.readFileSync(`${story.file}.agentctl.tmp`, "utf8")).toBe("Unfinished previous write");
    expect(fs.existsSync("/repo/.agentctl/runtime/task.lock")).toBe(false);
  });

  it("enforces context path boundaries", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "No traversal", parent: prd.id });
    fs.writeFileSync("/repo/.agentctl/project.yaml", "schemaVersion: 1\ncontext:\n  include: [../outside.md]\n");
    expect(claimNextTask(fs, "/repo")).toMatchObject({ ok: true, task: { id: story.id } });
    expect(() => getActiveTaskContext(fs, "/repo", story.id)).toThrow(/remain inside the project/);
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
  });
});

describe("explicit task ID claiming", () => {
  it("claims the requested stable ID instead of following queue priority", () => {
    const { fs, prd } = setup();
    const first = addRecord(fs, "/repo", { type: "story", title: "High priority", parent: prd.id });
    modify(fs, first.file, "priority: 3", "priority: 1");
    const second = addRecord(fs, "/repo", { type: "story", title: "Requested task", parent: prd.id });
    expect(selectNextTask(fs, "/repo")).toMatchObject({ ok: true, task: { id: first.id } });
    expect(selectTaskById(fs, "/repo", second.id)).toMatchObject({ ok: true, task: { id: second.id } });
    const claimed = claimTask(fs, "/repo", second.id);
    expect(claimed.ok && claimed.task.id).toBe(second.id);
    expect(findRecord(fs, "/repo", second.id).status).toBe("in-progress");
    expect(findRecord(fs, "/repo", first.id).status).toBe("pending");
    expect(getActiveTaskContext(fs, "/repo", second.id).task.id).toBe(second.id);
    expect(completeTask(fs, "/repo", second.id, green).status).toBe("implemented");
    expect(claimNextTask(fs, "/repo")).toMatchObject({ ok: true, task: { id: first.id } });
  });

  it("returns structured reasons for invalid, unknown and unavailable IDs", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Draft", parent: prd.id });
    expect(claimTask(fs, "/repo", "story-0001")).toMatchObject({ ok: false, code: "INVALID_TASK_ID" });
    expect(claimTask(fs, "/repo", "STORY-9999")).toMatchObject({ ok: false, code: "UNKNOWN_TASK" });
    modify(fs, story.file, "status: pending", "status: proposed");
    expect(claimTask(fs, "/repo", story.id)).toMatchObject({ ok: false, code: "TASK_NOT_READY" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("proposed");
  });

  it("never allows explicit claims to bypass prerequisites or active ownership", () => {
    const { fs, prd } = setup();
    const first = addRecord(fs, "/repo", { type: "story", title: "First", parent: prd.id });
    const second = addRecord(fs, "/repo", { type: "story", title: "Dependent", parent: prd.id });
    modify(fs, second.file, "depends_on: []", `depends_on: [${first.id}]`);
    const blocked = claimTask(fs, "/repo", second.id);
    expect(blocked).toMatchObject({ ok: false, code: "TASK_BLOCKED" });
    if (blocked.ok) throw new Error("Expected a blocked task");
    expect(blocked.blocked[0]).toMatchObject({ id: second.id });
    expect(blocked.blocked[0].reasons[0]).toContain(first.id);
    expect(findRecord(fs, "/repo", second.id).status).toBe("pending");
    expect(claimTask(fs, "/repo", first.id).ok).toBe(true);
    expect(claimTask(fs, "/repo", second.id)).toMatchObject({ ok: false, code: "TASK_IN_PROGRESS" });
  });

  it("rejects duplicate task identifiers instead of silently choosing a file", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Original", parent: prd.id });
    fs.writeFileSync("/repo/docs/work/items/STORY-9999-duplicate.md", fs.readFileSync(story.file, "utf8"));
    expect(claimTask(fs, "/repo", story.id)).toMatchObject({ ok: false, code: "DUPLICATE_TASK_ID" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("pending");
  });

  it("keeps an explicit claim in progress when subsequent context retrieval fails", () => {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Incomplete context", parent: prd.id });
    fs.writeFileSync("/repo/.agentctl/project.yaml", "schemaVersion: 1\ncontext:\n  include: [docs/missing.md]\n");
    expect(claimTask(fs, "/repo", story.id)).toMatchObject({ ok: true, task: { id: story.id } });
    expect(() => getActiveTaskContext(fs, "/repo", story.id)).toThrow(/Required context document is missing/);
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
    expect(fs.existsSync("/repo/.agentctl/runtime/task.lock")).toBe(false);
  });
});

describe("verified task completion", () => {
  function active() {
    const { fs, prd } = setup();
    const story = addRecord(fs, "/repo", { type: "story", title: "Verify first", parent: prd.id });
    expect(claimTask(fs, "/repo", story.id).ok).toBe(true);
    return { fs, story };
  }

  it("runs every original and newly registered gate, never unblocks on failure, and retries freshly", () => {
    const { fs, story } = active();
    addGate(fs, "/repo", "browser", "browser test", 10);
    const calls: string[] = [];
    const runner: RunCommand = (command) => {
      calls.push(command);
      expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
      return { ...green(command, "/repo", 0), exitCode: command === "browser test" ? 1 : 0 };
    };
    const result = completeTask(fs, "/repo", story.id, runner);
    expect(result).toMatchObject({ ok: false, code: "VERIFICATION_FAILED", status: "in-progress",
      verification: { passed: false, checks: [{ name: "browser", passed: false }, { name: "scaffold", passed: true }] } });
    expect(calls).toEqual(["browser test", "npm test"]);
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
    expect(completeTask(fs, "/repo", story.id, green)).toMatchObject({ ok: true, status: "implemented" });
  });

  it.each([
    ["command changed", "checks:\n  scaffold:\n    command: echo bypass\n    timeoutSeconds: 5\n"],
    ["timeout reduced", "checks:\n  scaffold:\n    command: npm test\n    timeoutSeconds: 1\n"],
    ["gate removed", "checks: {}\n"],
  ])("rejects claim-time policy weakening: %s", (_, config) => {
    const { fs, story } = active();
    fs.writeFileSync("/repo/.agentctl/checks.yaml", config);
    expect(completeTask(fs, "/repo", story.id, () => { throw new Error("must not run"); }))
      .toMatchObject({ ok: false, code: "VERIFICATION_POLICY_CHANGED" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
  });

  it("blocks a timeout, even with an exit code of zero", () => {
    const { fs, story } = active();
    expect(completeTask(fs, "/repo", story.id, () => ({ ...green("", "", 0), timedOut: true })))
      .toMatchObject({ ok: false, code: "VERIFICATION_FAILED" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
  });

  it("blocks missing claim evidence and supports empty initial configurations only after gates are added", () => {
    const { fs, prd } = setup();
    fs.writeFileSync("/repo/.agentctl/checks.yaml", "checks: {}\n");
    const story = addRecord(fs, "/repo", { type: "story", title: "Bootstrap", parent: prd.id });
    expect(claimTask(fs, "/repo", story.id).ok).toBe(true);
    expect(completeTask(fs, "/repo", story.id, green)).toMatchObject({ ok: false, code: "VERIFICATION_UNCONFIGURED" });
    addGate(fs, "/repo", "unit", "npm test");
    fs.unlinkSync("/repo/.agentctl/runtime/task-claim.json");
    expect(completeTask(fs, "/repo", story.id, green)).toMatchObject({ ok: false, code: "MISSING_BASELINE" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
  });

  it("allows a new gate to be registered during verification, but rejects the stale attempt", () => {
    const { fs, story } = active();
    const result = completeTask(fs, "/repo", story.id, () => {
      addGate(fs, "/repo", "extra", "extra test");
      return green("", "", 0);
    });
    expect(result).toMatchObject({ ok: false, code: "COMPLETION_STATE_CHANGED" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
    expect(completeTask(fs, "/repo", story.id, green)).toMatchObject({ ok: true });
  });

  it("rejects a task record changed during verification", () => {
    const { fs, story } = active();
    const result = completeTask(fs, "/repo", story.id, () => {
      fs.writeFileSync(story.file, fs.readFileSync(story.file, "utf8") + "\nChanged during verification.\n");
      return green("", "", 0);
    });
    expect(result).toMatchObject({ ok: false, code: "COMPLETION_STATE_CHANGED" });
    expect(findRecord(fs, "/repo", story.id).status).toBe("in-progress");
  });
});
