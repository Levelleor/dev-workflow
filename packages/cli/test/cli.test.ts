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

  it("explains project discovery through the project marker in help", () => {
    const output: string[] = [];
    const { fs } = fixture();
    expect(runCli(["--help"], { fs, cwd: "/repo", output: (value) => output.push(value) })).toBe(0);
    const text = output.join("\n");
    expect(text).toContain(".agentctl/project.yaml");
    expect(text).toContain("identifies the project root");
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
    expect(JSON.parse(output[0])).toEqual({
      records: { stories: 0, prds: 0, adrs: 0, notes: 0 },
      activeStories: 0,
    });
  });

  it("reports project diagnostics without a project identity", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    expect(runCli(["doctor", "--json"], { fs, cwd: "/repo", output: (value) => output.push(value) })).toBe(0);
    expect(JSON.parse(output[0])).toEqual({
      ok: true,
      problems: [],
      warnings: ["Profile 'feature' is not configured"],
    });
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

  it("returns role models and retry settings together through config show", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    expect(runCli(["config", "show", "--json"], {
      fs, cwd: "/repo", output: (value) => output.push(value),
    })).toBe(0);
    const config = JSON.parse(output[0]);
    expect(config.models.roles.worker).toEqual({ model: "deepseek/flash", thinking: "medium" });
    expect(config.models.repairRetries).toBe(2);
    expect(config.models.escalationThreshold).toBe(2);
    expect(config.models.reviewRetries).toBe(2);
    expect(config.models).not.toHaveProperty("limits");
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
