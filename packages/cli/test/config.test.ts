import { describe, expect, it } from "vitest";
import { getSetting, setSetting, showConfig } from "../src/config.js";
import { fixture } from "./fixtures.js";

describe("configuration", () => {
  it("reads and updates typed scalar values", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(getSetting(fs, "/repo", "project.orchestration.mode")).toBe("sequential");
    setSetting(fs, "/repo", "project.orchestration.mode", "parallel");
    expect(getSetting(fs, "/repo", "project.orchestration.mode")).toBe("parallel");
    expect(showConfig(fs, "/repo")).toHaveProperty("project");
    expect(showConfig(fs, "/repo")).not.toHaveProperty("models");
  });

  it("rejects unknown, unsafe, and protected settings", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => setSetting(fs, "/repo", "project.__proto__.polluted", "true")).toThrow(/Unsafe/);
    expect(() => getSetting(fs, "/repo", "models.roles.worker.model")).toThrow(/Unknown configuration file/);
    expect(() => setSetting(fs, "/repo", "project.project.unknown", "true")).toThrow(/Unknown setting/);
    expect(() => setSetting(fs, "/repo", "checks.profiles.feature", "true")).toThrow(/reviewed/);
    expect(() => setSetting(fs, "/repo", "project.project.id", "{x: 2}")).toThrow(/scalar/);
  });
});
