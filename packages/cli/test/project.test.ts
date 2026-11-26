import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { findProjectRoot, initProject } from "../src/project.js";

describe("repository bootstrap", () => {
  it("initialises safely, creates indexes and is idempotent", () => {
    const { fs, initialize } = fixture();
    const first = initialize();
    expect(first.created).toContain(".agentctl/project.yaml");
    const manifest = fs.readFileSync("/repo/.agentctl/project.yaml", "utf8");
    expect(manifest).toContain("context:");
    expect(manifest).not.toContain("REPLACE_WITH_PROJECT_ID");
    expect(manifest).not.toMatch(/^project:/m);
    expect(fs.existsSync("/repo/docs/work/items/README.md")).toBe(true);
    expect(fs.existsSync("/repo/docs/knowledge/research/README.md")).toBe(true);
    expect(fs.existsSync("/repo/docs/knowledge/brainstorming/README.md")).toBe(true);
    const second = initialize();
    expect(second.created).toEqual([]);
    expect(second.skipped).toContain("AGENTS.md");
    expect(findProjectRoot(fs, "/repo/docs/work/items")).toBe("/repo");
  });

  it("never overwrites existing files", () => {
    const { fs } = fixture();
    fs.writeFileSync("/repo/AGENTS.md", "# Keep this\n");
    const result = initProject(fs, "/repo", "/templates");
    expect(result.skipped).toContain("AGENTS.md");
    expect(fs.readFileSync("/repo/AGENTS.md", "utf8")).toBe("# Keep this\n");
  });

  it("rejects a directory that is not configured", () => {
    const { fs } = fixture();
    expect(() => findProjectRoot(fs, "/repo")).toThrow(/agentctl init/);
  });
});
