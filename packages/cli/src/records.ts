import { basename, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { FileSystem } from "./fs.js";
import { slug } from "./project.js";

export type RecordType = "story" | "prd" | "adr" | "note";
export type RecordEntry = {
  id: string;
  type: RecordType;
  title: string;
  status: string;
  file: string;
  metadata: Record<string, unknown>;
  body: string;
};

const directories: Record<RecordType, string> = {
  story: "docs/work/items",
  prd: "docs/product",
  adr: "docs/decisions",
  note: "docs/knowledge/inbox",
};
const prefixes: Record<RecordType, string> = {
  story: "STORY", prd: "PRD", adr: "ADR", note: "NOTE",
};

function decode(raw: string, file: string): RecordEntry {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!match) throw new Error(`Missing frontmatter: ${file}`);
  const value: unknown = parseYaml(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid frontmatter: ${file}`);
  }
  const metadata = value as Record<string, unknown>;
  const type = String(metadata.type) as RecordType;
  if (!(type in directories) || typeof metadata.id !== "string") {
    throw new Error(`Unrecognised record type or missing ID: ${file}`);
  }
  const body = raw.slice(match[0].length);
  const title = body.match(/^#\s+(.+)$/m)?.[1] ?? basename(file);
  return {
    id: metadata.id, type, title, status: String(metadata.status ?? "unknown"),
    file, metadata, body,
  };
}

export function listRecords(fs: FileSystem, root: string, type?: RecordType): RecordEntry[] {
  const result: RecordEntry[] = [];
  for (const selected of (type ? [type] : Object.keys(directories) as RecordType[])) {
    const relative = directories[selected];
    const folder = join(root, relative);
    if (!fs.existsSync(folder)) continue;
    const prefix = prefixes[selected];
    const recordFilename = new RegExp(`^${prefix}-\\d{4,}(?:-.+)?\\.md$`);
    for (const filename of fs.readdirSync(folder).filter((f) => recordFilename.test(f)).sort()) {
      const file = join(folder, filename);
      const record = decode(fs.readFileSync(file, "utf8"), file);
      if (record.type !== selected) throw new Error(`Record type and directory disagree: ${file}`);
      result.push(record);
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

export function findRecord(fs: FileSystem, root: string, id: string): RecordEntry {
  const record = listRecords(fs, root).find((item) => item.id === id);
  if (!record) throw new Error(`Unknown record: ${id}`);
  return record;
}

export type NewRecord = {
  type: RecordType;
  title: string;
  parent?: string;
  source?: string;
  related?: string[];
};

export function addRecord(fs: FileSystem, root: string, input: NewRecord): RecordEntry {
  const title = input.title.trim();
  if (!title) throw new Error("Title must not be empty.");
  if (/[\r\n\x00-\x1f]/.test(title)) throw new Error("Title must be a single line.");
  const all = listRecords(fs, root);
  if (input.type === "story") {
    if (!input.parent) throw new Error("Stories require --parent <PRD-ID>.");
    const parent = all.find((item) => item.id === input.parent);
    if (!parent || parent.type !== "prd") throw new Error(`Unknown PRD parent: ${input.parent}`);
  }
  if (input.type === "note") {
    if (!input.source || !all.some((item) => item.id === input.source)) {
      throw new Error("Inbox notes require --source <existing-record-ID>.");
    }
  }
  for (const related of input.related ?? []) {
    if (!all.some((item) => item.id === related)) throw new Error(`Unknown related record: ${related}`);
  }
  const prefix = prefixes[input.type];
  const numbers = all.map((item) => item.id.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1])
    .filter((value): value is string => !!value).map(Number);
  const id = `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`;
  const dir = join(root, directories[input.type]);
  const file = join(dir, `${id}-${slug(title)}.md`);
  const metadata: Record<string, unknown> = {
    id, type: input.type, status: input.type === "note" ? "inbox" : input.type === "story" ? "pending" : "proposed",
  };
  if (input.parent) metadata.parent = input.parent;
  if (input.source) metadata.source = input.source;
  if (input.type === "story") { metadata.depends_on = []; metadata.priority = 3; }
  metadata.related = input.related ?? [];
  const sections: Record<RecordType, string> = {
    story: "## Outcome\n\n## Acceptance criteria\n\n## Verification plan\n",
    prd: "## Problem\n\n## Goals\n\n## Acceptance criteria\n",
    adr: "## Context\n\n## Decision\n\n## Consequences\n",
    note: "## Discovery\n\n## Classification\n",
  };
  const raw = `---\n${stringifyYaml(metadata).trimEnd()}\n---\n\n# ${title}\n\n${sections[input.type]}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, raw, { encoding: "utf8", flag: "wx" });

  // Index entries are canonical discoverability links until a generated index exists.
  const index = join(dir, "README.md");
  const old = fs.existsSync(index) ? fs.readFileSync(index, "utf8") : `# ${input.type} records\n`;
  const link = `- [${id}: ${title}](${basename(file)})`;
  if (!old.includes(`(${basename(file)})`)) {
    fs.writeFileSync(index, `${old.trimEnd()}\n${link}\n`, { encoding: "utf8" });
  }
  return decode(raw, file);
}
