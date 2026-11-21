import { describe, expect, it, vi } from "vitest";
import { fixture } from "./fixtures.js";
import { verify } from "../src/verify.js";

describe("deterministic verification", () => {
  it("runs declared commands and records failure", () => {
    const { fs, initialize } = fixture();
    initialize();
    const runner = vi.fn().mockReturnValue(1);
    const result = verify(fs, "/repo", "scaffold", runner);
    expect(result.passed).toBe(false);
    expect(result.checks).toEqual([{ name: "scaffold", command: "npm test", passed: false }]);
    expect(runner).toHaveBeenCalledWith("npm test", "/repo", 5000);
  });

  it("passes only when all required checks pass", () => {
    const { fs, initialize } = fixture();
    initialize();
    const result = verify(fs, "/repo", "scaffold", () => 0);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(1);
  });

  it("fails closed on missing profiles or checks", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => verify(fs, "/repo", "feature", () => 0)).toThrow(/missing or empty/);
    fs.writeFileSync("/repo/.agentctl/checks.yaml", "profiles:\n  feature: [missing]\nchecks: {}\n");
    expect(() => verify(fs, "/repo", "feature", () => 0)).toThrow(/not configured/);
  });
});
