import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/fs.js";
import { initProject } from "../src/project.js";

export function fixture() {
  const volume = new Volume();
  const mem = createFsFromVolume(volume);
  mem.mkdirSync("/repo", { recursive: true });
  mem.mkdirSync("/templates/.agentctl", { recursive: true });
  mem.writeFileSync("/templates/AGENTS.md", "# Project agents\n");
  mem.mkdirSync("/templates/docs", { recursive: true });
  mem.writeFileSync("/templates/docs/project.md", "# Project goals\n");
  mem.writeFileSync("/templates/docs/conventions.md", "# Conventions\n");
  mem.writeFileSync("/templates/.agentctl/project.yaml", [
    "schemaVersion: 1", "project:", "  id: REPLACE_WITH_PROJECT_ID",
    "context:", "  include: [AGENTS.md, docs/project.md, docs/conventions.md]", "  reference: [docs/product/README.md]",
    "orchestration:", "  engine: ultracode", "  mode: sequential", "",
  ].join("\n"));
  mem.writeFileSync("/templates/.agentctl/models.yaml", [
    "schemaVersion: 1", "roles:", "  worker:", "    model: deepseek/flash",
    "    thinking: medium", "repairRetries: 2", "escalationThreshold: 2", "reviewRetries: 2", "",
  ].join("\n"));
  mem.writeFileSync("/templates/.agentctl/checks.yaml", [
    "schemaVersion: 1", "checks:", "  scaffold:",
    "    command: npm test", "    timeoutSeconds: 5", "profiles:",
    "  scaffold: [scaffold]", "  feature: []", "",
  ].join("\n"));
  const fs = mem as unknown as FileSystem;
  const initialize = () => initProject(fs, "/repo", "/templates");
  return { fs, mem, volume, initialize };
}
