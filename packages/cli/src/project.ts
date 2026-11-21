import { basename, dirname, join, parse, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { FileSystem } from "./fs.js";

export function slug(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "project";
}

export function findProjectRoot(fs: FileSystem, cwd: string): string {
  let current = resolve(cwd);
  while (true) {
    if (fs.existsSync(join(current, ".agentctl", "project.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) {
      throw new Error("Not an agentctl project. Run 'agentctl init' first.");
    }
    current = parent;
  }
}

export function readYaml(fs: FileSystem, file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) throw new Error(`Missing configuration: ${file}`);
  const value: unknown = parseYaml(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a YAML object: ${file}`);
  }
  return value as Record<string, unknown>;
}

export type InitResult = { root: string; created: string[]; skipped: string[] };

export function initProject(fs: FileSystem, root: string, templateRoot: string): InitResult {
  root = resolve(root);
  if (!fs.existsSync(root)) throw new Error(`Target directory does not exist: ${root}`);
  const created: string[] = [];
  const skipped: string[] = [];
  const files = ["AGENTS.md", ".agentctl/project.yaml", ".agentctl/checks.yaml"];
  for (const relative of files) {
    const destination = join(root, relative);
    if (fs.existsSync(destination)) {
      skipped.push(relative);
      continue;
    }
    const template = join(templateRoot, relative);
    let content = fs.readFileSync(template, "utf8");
    if (relative === ".agentctl/project.yaml") {
      content = content.replace("REPLACE_WITH_PROJECT_ID", slug(basename(root)));
    }
    fs.mkdirSync(dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, { encoding: "utf8", flag: "wx" });
    created.push(relative);
  }
  for (const relative of [
    "docs/product/README.md",
    "docs/decisions/README.md",
    "docs/work/items/README.md",
    "docs/knowledge/inbox/README.md",
  ]) {
    const destination = join(root, relative);
    if (fs.existsSync(destination)) {
      skipped.push(relative);
      continue;
    }
    fs.mkdirSync(dirname(destination), { recursive: true });
    const heading = relative.split("/").at(-2) ?? "Knowledge";
    fs.writeFileSync(destination, `# ${heading}\n\nRecords are indexed here.\n`, { encoding: "utf8", flag: "wx" });
    created.push(relative);
  }
  return { root, created, skipped };
}
