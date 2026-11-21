import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { runCli } from "../src/cli.js";
import { addRecord } from "../src/records.js";

describe("task CLI", () => {
  it("prints a complete context prompt and follows the sequential lifecycle", () => {
    const { fs, initialize } = fixture();
    initialize();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    addRecord(fs, "/repo", { type: "story", title: "Create feature", parent: prd.id });
    const output: string[] = [];
    const errors: string[] = [];
    const cli = (args: string[]) => runCli(args, {
      fs, cwd: "/repo", output: (text) => output.push(text), error: (text) => errors.push(text),
    });
    expect(cli(["task", "claim", "next"])).toBe(0);
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
    expect(runCli(["help"], { fs, cwd: "/repo", output: (text) => output.push(text) })).toBe(0);
    expect(output[0]).toContain("task claim next");
    expect(output[0]).toContain("Dependencies must be");
  });
});
