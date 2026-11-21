import { describe, expect, it } from "vitest";
import { getSetting, setSetting, showConfig } from "../src/config.js";
import { fixture } from "./fixtures.js";

describe("configuration", () => {
  it("reads and updates typed scalar values", () => {
    const { fs, initialize } = fixture();
    initialize();
    fs.writeFileSync("/repo/.agentctl/models.yaml", "roles:\n  worker:\n    model: deepseek/flash\n    maxTurns: 50\n");
    expect(getSetting(fs, "/repo", "models.roles.worker.model")).toBe("deepseek/flash");
    setSetting(fs, "/repo", "models.roles.worker.maxTurns", "25");
    expect(getSetting(fs, "/repo", "models.roles.worker.maxTurns")).toBe(25);
    expect(showConfig(fs, "/repo")).toHaveProperty("models");
  });

  it("rejects unknown, unsafe, and protected settings", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => setSetting(fs, "/repo", "project.__proto__.polluted", "true")).toThrow(/Unsafe/);
    expect(() => setSetting(fs, "/repo", "project.project.unknown", "true")).toThrow(/Unknown setting/);
    expect(() => setSetting(fs, "/repo", "checks.profiles.feature", "true")).toThrow(/reviewed/);
    expect(() => setSetting(fs, "/repo", "project.project.id", "{x: 2}")).toThrow(/scalar/);
  });
});
