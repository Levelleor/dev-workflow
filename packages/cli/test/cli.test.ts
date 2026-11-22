import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { fixture } from "./fixtures.js";
import { addRecord } from "../src/records.js";
import { claimTask } from "../src/task.js";

describe("CLI interface", () => {
  it("exposes usage and version without a repository", () => {
    const output: string[] = [];
    const { fs } = fixture();
    expect(runCli(["--help"], { fs, cwd: "/repo", output: (value) => output.push(value) })).toBe(0);
    expect(output.join("\n")).toContain("agentctl init");
    output.length = 0;
    expect(runCli(["--version"], { fs, cwd: "/repo", output: (value) => output.push(value) })).toBe(0);
    expect(output.join("\n")).toContain("0.1.0");
  });

  it("initialises an absolute target directory", () => {
    const { fs } = fixture();
    const output: string[] = [];
    const result = runCli(["init", "/repo"], { fs, cwd: "/templates", templates: "/templates", output: (value) => output.push(value) });
    expect(result).toBe(0);
    expect(fs.existsSync("/repo/.agentctl/project.yaml")).toBe(true);
  });

  it("supports JSON status for agent consumers", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const result = runCli(["--json", "status"], { fs, cwd: "/repo", output: (value) => output.push(value) });
    expect(result).toBe(0);
    expect(JSON.parse(output[0]).project.id).toBe("repo");
  });

  it("creates and displays work items through commands", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const opts = { fs, cwd: "/repo", output: (value: string) => output.push(value) };
    expect(runCli(["knowledge", "add", "--type", "prd", "--title", "Board"], opts)).toBe(0);
    expect(runCli(["work", "add", "--title", "Create a board", "--parent", "PRD-0001"], opts)).toBe(0);
    expect(runCli(["work", "list"], opts)).toBe(0);
    expect(output.at(-1)).toContain("STORY-0001");
  });

  it("returns task context and gate policy together in one read-only snapshot", () => {
    const { fs, initialize } = fixture();
    initialize();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Product" });
    const story = addRecord(fs, "/repo", { type: "story", title: "Implement feature", parent: prd.id });
    expect(claimTask(fs, "/repo", story.id).ok).toBe(true);
    const output: string[] = [];
    const errors: string[] = [];
    const opts = { fs, cwd: "/repo", output: (value: string) => output.push(value), error: (value: string) => errors.push(value) };
    expect(runCli(["task", "snapshot", story.id, "--json"], opts)).toBe(0);
    const snapshot = JSON.parse(output[0]);
    expect(snapshot.context.task.id).toBe(story.id);
    expect(snapshot.context.prompt).toContain("Product");
    expect(snapshot.gates).toEqual([{ name: "scaffold", command: "npm test", timeoutSeconds: 5, required: true }]);
    expect(runCli(["task", "snapshot", "STORY-9999", "--json"], opts)).toBe(1);
    expect(errors.at(-1)).toMatch(/not in progress/);
    expect(runCli(["task", "snapshot", story.id, "extra", "--json"], opts)).toBe(1);
    expect(errors.at(-1)).toMatch(/Usage/);
  });

  it("returns a nonzero exit status on unconfigured verification", () => {
    const { fs, initialize } = fixture();
    initialize();
    const errors: string[] = [];
    const result = runCli(["verify", "--profile", "feature"], {
      fs, cwd: "/repo", error: (value) => errors.push(value),
    });
    expect(result).toBe(1);
    expect(errors.at(-1)).toContain("missing or empty");
  });
});
