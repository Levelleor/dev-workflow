import { describe, expect, it, vi } from "vitest";
import { fixture } from "./fixtures.js";
import { runCli } from "../src/cli.js";
import { listGates } from "../src/verify.js";

describe("verification CLI", () => {
  it("registers a shell command with flags, lists gates and runs one gate", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const errors: string[] = [];
    const runner = vi.fn(() => ({ exitCode: 0, stdout: "one passed", stderr: "", durationMs: 10 }));
    const run = (argv: string[]) => runCli(argv, {
      fs, cwd: "/repo", runner,
      output: (v) => output.push(v), error: (v) => errors.push(v),
    });
    expect(run(["verify", "add", "browser", "--timeout", "600", "--json", "--",
      "npx", "playwright", "test", "--headed"])).toBe(0);
    expect(JSON.parse(output.at(-1)!)).toEqual({
      name: "browser", command: "npx playwright test --headed", timeoutSeconds: 600,
    });
    expect(run(["verify", "list", "--json"])).toBe(0);
    const listed = JSON.parse(output.at(-1)!);
    expect(listed.map((g: { name: string }) => g.name)).toEqual(["browser", "scaffold"]);
    expect(listed.every((gate: Record<string, unknown>) => !Object.hasOwn(gate, "required"))).toBe(true);
    expect(run(["verify", "browser", "--json"])).toBe(0);
    const result = JSON.parse(output.at(-1)!);
    expect(result.checks[0]).toMatchObject({
      name: "browser", passed: true, stdout: "one passed", exitCode: 0,
    });
    expect(runner).toHaveBeenCalledWith("npx playwright test --headed", "/repo", 600000);
    expect(errors).toEqual([]);
  });

  it("runs all gates and emits clean JSON on failure", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    const runner = vi.fn(() => ({
      exitCode: 2, stdout: "test output", stderr: "test failed", durationMs: 22,
    }));
    const code = runCli(["verify", "--json"], {
      fs, cwd: "/repo", runner, output: (v) => output.push(v),
    });
    expect(code).toBe(1);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({
      selection: "all", passed: false,
      checks: [{ name: "scaffold", exitCode: 2, stderr: "test failed" }],
    });
  });

  it("keeps legacy profile usage, disallows replacements and requires -- delimiter", () => {
    const { fs, initialize } = fixture();
    initialize();
    const errors: string[] = [];
    const run = (argv: string[]) => runCli(argv, {
      fs, cwd: "/repo", runner: () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 }),
      error: (v) => errors.push(v), output: () => {},
    });
    expect(run(["verify", "--profile", "scaffold"])).toBe(0);
    expect(run(["verify", "add", "scaffold", "--", "echo", "skip"])).toBe(1);
    expect(errors.at(-1)).toContain("already exists");
    expect(run(["verify", "add", "browser", "npx", "playwright", "test"])).toBe(1);
    expect(errors.at(-1)).toContain("Usage");
    expect(listGates(fs, "/repo")).toHaveLength(1);
  });

  it("preserves an argument containing whitespace", () => {
    const { fs, initialize } = fixture();
    initialize();
    const output: string[] = [];
    expect(runCli(["verify", "add", "special", "--", "node", "-e", "console.log('hello world')"], {
      fs, cwd: "/repo", output: (v) => output.push(v),
    })).toBe(0);
    const cmd = listGates(fs, "/repo").find((gate) => gate.name === "special")!.command;
    expect(cmd).toContain("hello world");
    expect(cmd).toContain("node -e ");
  });
});
