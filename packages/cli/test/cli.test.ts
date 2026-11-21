import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { fixture } from "./fixtures.js";

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

  it("supports JSON status for agent consumers", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const result = runCli(["status", "--json"], { fs, cwd: "/repo", output: (value) => output.push(value) });
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
