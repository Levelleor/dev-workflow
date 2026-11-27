import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { runCli } from "../src/cli.js";
import { addRecord } from "../src/records.js";

describe("task CLI", () => {
  it("prints compact claim metadata and gets the full context in a separate command", () => {
    const { fs, initialize } = fixture();
    initialize();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    addRecord(fs, "/repo", { type: "story", title: "Create feature", parent: prd.id });
    const output: string[] = [];
    const errors: string[] = [];
    const cli = (args: string[]) => runCli(args, {
      fs, cwd: "/repo", runner: () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }), output: (text) => output.push(text), error: (text) => errors.push(text),
    });
    expect(cli(["task", "claim", "next"])).toBe(0);
    expect(output.at(-1)).toContain("Claimed STORY-0001");
    expect(output.at(-1)).not.toContain("Project context (included)");
    expect(cli(["task", "getcontext"])).toBe(0);
    expect(output.at(-1)).toContain("Project context (included)");
    expect(output.at(-1)).toContain("Create feature");
    expect(cli(["task", "claim", "next", "--json"])).toBe(2);
    const unavailable = JSON.parse(output.at(-1)!);
    expect(unavailable.code).toBe("TASK_IN_PROGRESS");
    expect(cli(["task", "getcontext", "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!).task.status).toBe("in-progress");
    expect(cli(["task", "complete"])).toBe(0);
    expect(cli(["task", "claim", "next"])).toBe(2);
    expect(output.at(-1)).toContain("No pending/ready tasks");
    expect(errors).toEqual([]);
  });

  it("explains usage via built-in help without project context", () => {
    const { fs } = fixture();
    const output: string[] = [];
    expect(runCli(["help", "task", "claim"], { fs, cwd: "/repo", runner: () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }), output: (text) => output.push(text) })).toBe(0);
    expect(output[0]).toContain("task claim next");
    expect(output[0]).toContain("Dependencies must be");
  });
});

describe("explicit ID CLI consistency", () => {
  it("supports positional IDs across claim, getcontext and complete with JSON output", () => {
    const { fs, initialize } = fixture();
    initialize();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    const task = addRecord(fs, "/repo", { type: "story", title: "Chosen task", parent: prd.id });
    const output: string[] = [];
    const errors: string[] = [];
    const run = (argv: string[]) => runCli(argv, {
      fs, cwd: "/repo", runner: () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }), output: (value) => output.push(value), error: (value) => errors.push(value),
    });
    expect(run(["task", "claim", task.id, "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!)).toEqual({
      ok: true, task: { id: task.id, title: "Chosen task", status: "in-progress" },
    });
    expect(run(["task", "getcontext", task.id, "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!).task.status).toBe("in-progress");
    expect(run(["task", "complete", task.id, "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({ ok: true, id: task.id, status: "implemented", verification: { passed: true } });
    expect(errors).toEqual([]);
  });

  it("uses the same unavailable diagnostic for explicit and next claims", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const run = (argv: string[]) => runCli(argv, { fs, cwd: "/repo", runner: () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }), output: (value) => output.push(value) });
    expect(run(["task", "claim", "STORY-9999", "--json"])).toBe(2);
    expect(JSON.parse(output.at(-1)!).code).toBe("UNKNOWN_TASK");
    expect(run(["task", "claim", "next", "--json"])).toBe(2);
    expect(JSON.parse(output.at(-1)!).code).toBe("NO_PENDING_TASKS");
  });

  it("rejects mixed task ID syntax and extra positional arguments", () => {
    const { fs, initialize } = fixture();
    initialize();
    const errors: string[] = [];
    const run = (argv: string[]) => runCli(argv, { fs, cwd: "/repo", error: (value) => errors.push(value) });
    expect(run(["task", "claim", "--id", "STORY-0001"])).toBe(1);
    expect(errors.at(-1)).toContain("positional");
    expect(run(["task", "getcontext", "STORY-0001", "STORY-0002"])).toBe(1);
    expect(errors.at(-1)).toContain("Usage:");
    expect(run(["task", "claim", "next", "STORY-0001"])).toBe(1);
  });
});

it("returns a structured completion failure and leaves the story in progress", () => {
  const { fs, initialize } = fixture();
  initialize();
  const prd = addRecord(fs, "/repo", { type: "prd", title: "Product" });
  const task = addRecord(fs, "/repo", { type: "story", title: "Test failure", parent: prd.id });
  const output: string[] = [];
  const run = (argv: string[]) => runCli(argv, { fs, cwd: "/repo", output: (value) => output.push(value),
    runner: () => ({ exitCode: 1, stdout: "", stderr: "test failed", durationMs: 5 }) });
  expect(run(["task", "claim", task.id])).toBe(0);
  expect(run(["task", "complete", task.id, "--json"])).toBe(1);
  expect(JSON.parse(output.at(-1)!)).toMatchObject({ ok: false, id: task.id, status: "in-progress",
    code: "VERIFICATION_FAILED", verification: { passed: false, checks: [{ stderr: "test failed" }] } });
  expect(fs.readFileSync(task.file, "utf8")).toContain("status: in-progress");
});
