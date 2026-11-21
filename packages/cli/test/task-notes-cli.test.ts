import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { runCli } from "../src/cli.js";
import { addRecord } from "../src/records.js";

describe("task notes CLI", () => {
  it("uses the current task by default and supports JSON add/list/remove", () => {
    const { fs, initialize } = fixture();
    initialize();
    const product = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    const story = addRecord(fs, "/repo", { type: "story", title: "Story", parent: product.id });
    const output: string[] = [];
    const run = (args: string[]) => runCli(args, {
      fs, cwd: "/repo", output: (v) => output.push(v),
    });
    expect(run(["task", "claim", story.id])).toBe(0);
    expect(run(["task", "notes", "add", "Look into timeout", "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!)).toEqual({ id: "N001", text: "Look into timeout" });
    expect(run(["task", "notes", "list", "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({
      taskId: story.id, notes: [{ id: "N001", text: "Look into timeout" }],
    });
    expect(run(["task", "getcontext"])).toBe(0);
    expect(output.at(-1)).toContain("Look into timeout");
    expect(run(["task", "notes", "remove", "N001", "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!).id).toBe("N001");
    expect(run(["task", "notes", "list", "--json"])).toBe(0);
    expect(JSON.parse(output.at(-1)!).notes).toEqual([]);
  });

  it("uses explicit task IDs without claiming a task", () => {
    const { fs, initialize } = fixture();
    initialize();
    const product = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    const story = addRecord(fs, "/repo", { type: "story", title: "Story", parent: product.id });
    const output: string[] = [];
    const run = (args: string[]) => runCli(args, {
      fs, cwd: "/repo", output: (v) => output.push(v),
    });
    expect(run(["task", story.id, "notes", "add", "Pending note"])).toBe(0);
    expect(run(["task", story.id, "notes", "list"])).toBe(0);
    expect(output.at(-1)).toContain("N001: Pending note");
  });
});
