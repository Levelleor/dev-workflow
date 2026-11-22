import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { FileSystem } from "./fs.js";
import { readYaml } from "./project.js";
import { listRecords, type RecordEntry } from "./records.js";

export type ContextDocument = { path: string; content: string; id?: string };
export type TaskContext = {
  task: { id: string; title: string; status: string; path: string };
  project: ContextDocument[];
  related: ContextDocument[];
  references: string[];
  prompt: string;
};

const maxDocumentBytes = 12000;
const maxContextBytes = 48000;

function paths(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Expected string paths in context.${name}.`);
  }
  return value;
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function safePath(root: string, path: string): string {
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(`Context path must remain inside the project: ${path}`);
  }
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Invalid context document path: ${path}`);
  }
  return absolute;
}

export function buildTaskContext(fs: FileSystem, root: string, task: RecordEntry): TaskContext {
  if (task.type !== "story") throw new Error(`Not a task: ${task.id}`);
  const project = readYaml(fs, join(root, ".agentctl", "project.yaml"));
  const settings = (project.context ?? {}) as Record<string, unknown>;
  const includes = paths(settings.include, "include");
  const references = paths(settings.reference, "reference");
  const projectFiles = includes.length ? includes : ["AGENTS.md"];
  const indexed = listRecords(fs, root);
  const byId = new Map(indexed.map((record) => [record.id, record]));

  const parentId = task.metadata.parent;
  const parent = typeof parentId === "string" ? byId.get(parentId) : undefined;
  if (!parent || parent.type !== "prd") throw new Error(`Task ${task.id} has no resolvable PRD parent.`);

  const projectDocs: ContextDocument[] = [];
  const taskDocs: ContextDocument[] = [];
  const optional = new Set<string>(references);
  const seen = new Set<string>();
  let usedBytes = 0;

  function include(path: string, target: ContextDocument[], required: boolean, id?: string): void {
    if (seen.has(path)) return;
    const file = safePath(root, path);
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Required context document is missing: ${path}`);
      return;
    }
    const content = fs.readFileSync(file, "utf8");
    const size = Buffer.byteLength(content, "utf8");
    if (size > maxDocumentBytes || usedBytes + size > maxContextBytes) {
      if (required) throw new Error(`Required context exceeds the size limit: ${path}`);
      optional.add(path);
      return;
    }
    usedBytes += size;
    seen.add(path);
    target.push({ path, content, ...(id ? { id } : {}) });
  }

  for (const path of projectFiles) include(path, projectDocs, true);
  // Give the worker the exact configured verification gates, not just a vague instruction.
  include(".agentctl/checks.yaml", projectDocs, true);
  // Task and parent requirements are mandatory. ADRs and supporting records are bounded.
  const fileOf = (record: RecordEntry) => relative(root, record.file).replaceAll("\\", "/");
  include(fileOf(task), taskDocs, true, task.id);
  include(fileOf(parent), taskDocs, true, parent.id);

  for (const id of new Set([...ids(task.metadata.related), ...ids(parent.metadata.related)])) {
    const record = byId.get(id);
    if (!record) throw new Error(`Broken context relationship: ${id}`);
    const path = fileOf(record);
    if (record.type === "adr" && record.status !== "accepted") optional.add(path);
    else include(path, taskDocs, false, record.id);
  }
  for (const id of ids(task.metadata.depends_on)) {
    const record = byId.get(id);
    if (record) optional.add(`${fileOf(record)} [${record.status}]`);
  }

  // Plans are linked through frontmatter, not file-name conventions.
  const plansDir = join(root, "docs", "work", "plans");
  if (fs.existsSync(plansDir)) {
    for (const name of fs.readdirSync(plansDir).filter((name) => name.endsWith(".md") && name !== "README.md").sort()) {
      const path = `docs/work/plans/${name}`;
      const content = fs.readFileSync(safePath(root, path), "utf8");
      const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
      if (!match) continue;
      const header: unknown = parseYaml(match[1]);
      if (header && typeof header === "object" && !Array.isArray(header)) {
        const metadata = header as Record<string, unknown>;
        if (metadata.parent === task.id && metadata.status !== "archived") include(path, taskDocs, false);
      }
    }
  }

  for (const path of [...optional]) {
    if (!path.includes(" [") && !fs.existsSync(safePath(root, path))) optional.delete(path);
  }

  const render = (document: ContextDocument) => `### ${document.path}\n\n${document.content.trimEnd()}`;
  const instruction = [
    `# Assignment: ${task.id} — ${task.title}`,
    `Status: ${task.status}.`,
    "Implement this assigned task using the source repository. Follow the acceptance criteria and applicable decisions below.",
    "Use agentctl for work/knowledge queries and state updates. Do not reinterpret optional references as automatically loaded context.",
    "",
    "## Project context (included)",
    ...projectDocs.map(render),
    "",
    "## Task context (included)",
    ...taskDocs.map(render),
    "",
    "## Optional references (read only if needed)",
    ...[...optional].sort().map((path) => `- ${path}`),
    "",
    "## Handoff",
    "Implement and test the change. Run the configured checks, report limitations, then use 'agentctl task complete' to mark implementation finished.",
    "'implemented' does not mean independently verified or accepted.",
  ].join("\n\n");
  return {
    task: { id: task.id, title: task.title, status: task.status, path: fileOf(task) },
    project: projectDocs, related: taskDocs,
    references: [...optional].sort(), prompt: instruction,
  };
}
