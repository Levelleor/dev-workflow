import { describe, expect, it } from "vitest";
import { getSetting, setSetting, showConfig } from "../src/config.js";
import { fixture } from "./fixtures.js";

describe("configuration", () => {
  it("reads and updates typed scalar values", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(getSetting(fs, "/repo", "models.roles.worker.model")).toBe("deepseek/flash");
    expect(getSetting(fs, "/repo", "models.roles.worker.thinking")).toBe("medium");
    setSetting(fs, "/repo", "models.roles.worker.thinking", "high");
    expect(getSetting(fs, "/repo", "models.roles.worker.thinking")).toBe("high");
    setSetting(fs, "/repo", "models.repairRetries", "1");
    expect(getSetting(fs, "/repo", "models.repairRetries")).toBe(1);
    expect(showConfig(fs, "/repo")).toHaveProperty("models");
    expect(showConfig(fs, "/repo").project).toEqual({
      schemaVersion: 1,
      context: {
        include: ["AGENTS.md", "docs/project.md", "docs/conventions.md"],
        reference: ["docs/product/README.md"],
      },
    });
  });

  it("rejects unknown, unsafe, and protected settings", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => setSetting(fs, "/repo", "project.__proto__.polluted", "true")).toThrow(/Unsafe/);
    expect(() => setSetting(fs, "/repo", "project.context.unknown", "true")).toThrow(/Unknown setting/);
    expect(() => setSetting(fs, "/repo", "checks.profiles.feature", "true")).toThrow(/reviewed/);
    expect(() => setSetting(fs, "/repo", "project.context.include", "{x: 2}")).toThrow(/scalar/);
  });
});
