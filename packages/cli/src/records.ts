import { basename, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { formatDiagnostic } from "./document-links.js";
import { lintNewDocument } from "./documents.js";
import { readFrontmatter } from "./frontmatter.js";
import { withRecordLock, writeFileAtomically, type FileSystem } from "./fs.js";
import { escapeMarkdownText, fragmentHasBoundary, markdownTitle, parseMarkdown } from "./markdown.js";
import { slug } from "./project.js";
import { recordTypeNames, recordTypes, type RecordType } from "./record-types.js";

export type { RecordType } from "./record-types.js";
export type RecordEntry = {
  id: string;
  type: RecordType;
  title: string;
  status: string;
  file: string;
  metadata: Record<string, unknown>;
  body: string;
};

function decode(raw: string, file: string): RecordEntry {
  let parsed: ReturnType<typeof readFrontmatter>;
  try {
    parsed = readFrontmatter(raw);
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed) throw new Error(`Missing frontmatter: ${file}`);
  const { metadata, body } = parsed;
  if (typeof metadata.type !== "string" || !Object.hasOwn(recordTypes, metadata.type) || typeof metadata.id !== "string") {
    throw new Error(`Unrecognised record type or missing ID: ${file}`);
  }
  const type = metadata.type as RecordType;
  const title = markdownTitle(parseMarkdown(body)) ?? basename(file);
  return {
    id: metadata.id, type, title, status: String(metadata.status ?? "unknown"),
    file, metadata, body,
  };
}

export function listRecords(fs: FileSystem, root: string, type?: RecordType): RecordEntry[] {
  const result: RecordEntry[] = [];
  for (const selected of type ? [type] : recordTypeNames) {
    const { directory, prefix } = recordTypes[selected];
    const folder = join(root, directory);
    if (!fs.existsSync(folder)) continue;
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
  dependsOn?: string[];
  blockedBy?: string[];
  sections?: ReadonlyMap<string, string>;
};

function renderSections(input: NewRecord): string {
  const sections = recordTypes[input.type].sections;
  for (const [name, body] of input.sections ?? []) {
    if (!Object.hasOwn(sections, name)) throw new Error(`Unknown section '${name}' for ${input.type}.`);
    if (parseMarkdown(body).children.some((node) => node.type === "heading" && node.depth <= 2)) {
      throw new Error(`Section '${name}' cannot contain a level-one or level-two heading. Use ### for subheadings.`);
    }
    if (!fragmentHasBoundary(body)) throw new Error(`Close the Markdown block in section '${name}'.`);
  }
  return Object.entries(sections).map(([key, heading]) => {
    const content = input.sections?.get(key)?.replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, "");
    return content ? `## ${heading}\n\n${content}` : `## ${heading}`;
  }).join("\n\n");
}

export function addRecord(fs: FileSystem, root: string, input: NewRecord): RecordEntry {
  const title = input.title.trim();
  if (!title) throw new Error("Title must not be empty.");
  if (/[\r\n\x00-\x1f]/.test(title)) throw new Error("Title must be a single line.");
  const sections = renderSections(input);
  return withRecordLock(fs, root, () => {
    const { directory, prefix, initialStatus } = recordTypes[input.type];
    let dir = root;
    for (const part of directory.split("/")) {
      dir = join(dir, part);
      if (fs.existsSync(dir) && !fs.lstatSync(dir).isDirectory()) {
        throw new Error(`Expected a regular record directory: ${dir}`);
      }
    }
    const all = listRecords(fs, root);
    const numbers = all.map((item) => item.id.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1])
      .filter((value): value is string => !!value).map(Number);
    const id = `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`;
    const file = join(dir, `${id}-${slug(title)}.md`);
    const metadata: Record<string, unknown> = {
      id, type: input.type, status: initialStatus,
      created_at: new Date().toISOString().slice(0, 10),
    };
    if (input.parent) metadata.parent = input.parent;
    if (input.source) metadata.source = input.source;
    if (input.type === "story") {
      metadata.depends_on = input.dependsOn ?? [];
      if (input.blockedBy) metadata.blocked_by = input.blockedBy;
      metadata.priority = 3;
    }
    metadata.related = input.related ?? [];
    const escapedTitle = escapeMarkdownText(title);
    const raw = `---\n${stringifyYaml(metadata).trimEnd()}\n---\n\n# ${escapedTitle}\n\n${sections}\n`;
    const index = join(dir, "README.md");
    if (fs.existsSync(index) && !fs.lstatSync(index).isFile()) throw new Error(`Expected a regular category index: ${index}`);
    const old = fs.existsSync(index) ? fs.readFileSync(index, "utf8") : `# ${input.type} records\n`;
    if (!fragmentHasBoundary(old)) throw new Error(`Close the Markdown block before appending a link to ${index}.`);
    const link = `- [${id}: ${escapedTitle}](${basename(file)})`;
    const indexed = old.split(/\r?\n/).includes(link);
    const next = indexed ? old : `${old.trimEnd()}\n\n${link}\n`;
    const issues = lintNewDocument(fs, root, file, raw, index, next, all);
    if (issues.length) {
      throw new Error(issues.map((issue) => issue.code === "relationship" ? issue.message : formatDiagnostic(issue)).join("\n"));
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, raw, { encoding: "utf8", flag: "wx" });
    try {
      if (!indexed) writeFileAtomically(fs, index, next);
    } catch (error) {
      fs.unlinkSync(file);
      throw error;
    }
    return decode(raw, file);
  });
}
