import { describe, expect, it, vi } from "vitest";
import { fixture } from "./fixtures.js";
import { addGate, listGates, verify, type RunCommand } from "../src/verify.js";

const outcome = (exitCode: number | null, stderr = "") => ({
  exitCode, stdout: exitCode === 0 ? "tests passed" : "",
  stderr, durationMs: 24, timedOut: exitCode === null,
});

describe("deterministic verification gates", () => {
  it("runs all registered gates alphabetically and collects failures", () => {
    const { fs, initialize } = fixture();
    initialize();
    addGate(fs, "/repo", "browser", "npx playwright test", 600);
    const runner = vi.fn<RunCommand>((command) =>
      command.startsWith("npx") ? outcome(1, "One browser test failed") : outcome(0));
    const result = verify(fs, "/repo", "all", runner);
    expect(result.selection).toBe("all");
    expect(result.passed).toBe(false);
    expect(result.checks.map((gate) => gate.name)).toEqual(["browser", "scaffold"]);
    expect(result.checks.every((gate) => !Object.hasOwn(gate, "required"))).toBe(true);
    expect(result.checks[0]).toMatchObject({
      exitCode: 1, passed: false, stderr: "One browser test failed",
    });
    expect(result.checks[1].passed).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenCalledWith("npx playwright test", "/repo", 600000);
  });

  it("executes a single named gate or a legacy profile", () => {
    const { fs, initialize } = fixture();
    initialize();
    const runner = vi.fn<RunCommand>(() => outcome(0));
    expect(verify(fs, "/repo", "scaffold", runner).passed).toBe(true);
    expect(verify(fs, "/repo", "scaffold", runner, "profile")).toMatchObject({
      selection: "profile:scaffold", passed: true,
    });
    expect(runner).toHaveBeenCalledWith("npm test", "/repo", 5000);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("fails closed on unknown gates, empty profiles, or no gates", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => verify(fs, "/repo", "missing", () => outcome(0))).toThrow(/not registered/);
    expect(() => verify(fs, "/repo", "feature", () => outcome(0), "profile")).toThrow(/missing or empty/);
    fs.writeFileSync("/repo/.agentctl/checks.yaml", "checks: {}\nprofiles: {}\n");
    expect(() => verify(fs, "/repo", "all", () => outcome(0))).toThrow(/No verification gates/);
    expect(listGates(fs, "/repo")).toEqual([]);
  });

  it("enforces policy.unconfiguredProfile on empty and missing profiles", () => {
    const { fs, initialize } = fixture();
    initialize();
    const file = "/repo/.agentctl/checks.yaml";
    const original = fs.readFileSync(file, "utf8");
    expect(original).toContain("unconfiguredProfile: block");
    const runner = vi.fn<RunCommand>(() => outcome(0));
    for (const target of ["feature", "missing"]) {
      expect(() => verify(fs, "/repo", target, runner, "profile")).toThrow(/unconfiguredProfile: block/);
    }
    expect(runner).not.toHaveBeenCalled();

    for (const invalid of ["allow", "warn", "false", "1", "null"]) {
      fs.writeFileSync(file, original.replace("unconfiguredProfile: block", `unconfiguredProfile: ${invalid}`));
      expect(() => verify(fs, "/repo", "feature", runner, "profile")).toThrow(/unconfiguredProfile must be 'block'/);
    }
    fs.writeFileSync(file, original.replace("policy:\n  unconfiguredProfile: block\n", ""));
    expect(() => verify(fs, "/repo", "feature", runner, "profile")).toThrow(/missing or empty/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("preserves existing comments and gates, and refuses to replace one", () => {
    const { fs, initialize } = fixture();
    initialize();
    const gate = addGate(fs, "/repo", "unit", "npm test", 30);
    expect(gate).toEqual({ name: "unit", command: "npm test", timeoutSeconds: 30 });
    const config = fs.readFileSync("/repo/.agentctl/checks.yaml", "utf8");
    expect(config).toContain("scaffold:");
    expect(config).toContain("feature: []");
    expect(config).not.toMatch(/\brequired\s*:/);
    expect(listGates(fs, "/repo").map((gate) => gate.name)).toEqual(["scaffold", "unit"]);
    expect(() => addGate(fs, "/repo", "unit", "echo skip")).toThrow(/already exists/);
    expect(fs.readFileSync("/repo/.agentctl/checks.yaml", "utf8")).toBe(config);
  });

  it("rejects obsolete required flags rather than implying optional checks", () => {
    const { fs, initialize } = fixture();
    initialize();
    const filename = "/repo/.agentctl/checks.yaml";
    const original = fs.readFileSync(filename, "utf8");
    for (const required of ["true", "false"]) {
      fs.writeFileSync(filename, original.replace("command: npm test",
        `command: npm test\n    required: ${required}`));
      expect(() => listGates(fs, "/repo")).toThrow(/removed 'required' setting/);
      expect(() => verify(fs, "/repo", "all", () => outcome(0))).toThrow(/removed 'required' setting/);
    }
  });

  it("rejects unsafe names, invalid commands and invalid timeouts", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => addGate(fs, "/repo", "../evil", "echo x")).toThrow(/Gate names/);
    expect(() => addGate(fs, "/repo", "all", "echo x")).toThrow(/Gate names/);
    expect(() => addGate(fs, "/repo", "other", " ")).toThrow(/command is required/);
    expect(() => addGate(fs, "/repo", "other", "echo x", 0)).toThrow(/timeout/);
  });

  it("fails on timeout even when a runner returns exit code 0", () => {
    const { fs, initialize } = fixture();
    initialize();
    const result = verify(fs, "/repo", "scaffold", () => ({
      ...outcome(0), timedOut: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(false);
  });

  it("leaves the policy intact if a previous interrupted update left a temporary file", () => {
    const { fs, initialize } = fixture();
    initialize();
    fs.writeFileSync("/repo/.agentctl/checks.yaml.agentctl.tmp", "unfinished");
    const before = fs.readFileSync("/repo/.agentctl/checks.yaml", "utf8");
    expect(() => addGate(fs, "/repo", "unit", "npm test")).toThrow();
    expect(fs.readFileSync("/repo/.agentctl/checks.yaml", "utf8")).toBe(before);
  });
});
