import { basename, dirname, join } from "node:path";
import { documentLinkChecker, documentPath, type DocumentDiagnostic } from "./document-links.js";
import type { FileSystem } from "./fs.js";
import { FrontmatterError, readFrontmatter } from "./frontmatter.js";
import { markdownTitle, parseMarkdown } from "./markdown.js";
import { NoteFormatError, parseNotes } from "./note-sections.js";
import { recordTypeNames, recordTypes, type RecordType } from "./record-types.js";

type Identity = { id: string; type: RecordType | "workflow"; file: string };
type Document = {
  file: string;
  path: string;
  body: string;
  lineOffset: number;
  metadata: Record<string, unknown>;
  keys: Map<string, number>;
  type?: Identity["type"];
  identity?: Identity;
  plan: boolean;
};

function readDocument(root: string, file: string, raw: string, issues: DocumentDiagnostic[]): Document | undefined {
  const path = documentPath(root, file);
  let frontmatter: ReturnType<typeof readFrontmatter>;
  try {
    frontmatter = readFrontmatter(raw);
  } catch (error) {
    if (!(error instanceof FrontmatterError)) throw error;
    issues.push({ path, line: error.line, code: "frontmatter", message: error.message });
    return undefined;
  }

  const metadata = frontmatter?.metadata ?? {};
  const filename = basename(file);
  const directory = dirname(path);
  const expectedType = recordTypeNames.find((type) => filename.startsWith(`${recordTypes[type].prefix}-`))
    ?? (filename.startsWith("FLOW-") ? "workflow" : undefined);
  const type = expectedType ?? recordTypeNames.find((type) => type === metadata.type)
    ?? (metadata.type === "workflow" ? "workflow" : undefined);
  const plan = directory === "docs/work/plans" && filename !== "README.md";
  const keys = frontmatter?.keys ?? new Map<string, number>();
  const issue = (message: string, key?: string) => issues.push({
    path, line: (key ? keys.get(key) : undefined) ?? 1, code: "frontmatter", message,
  });
  let identity: Identity | undefined;

  if ((type || plan) && !frontmatter) {
    issue("YAML frontmatter is required.");
  } else if (type && frontmatter) {
    const workflow = type === "workflow";
    const prefix = workflow ? "FLOW" : recordTypes[type].prefix;
    const expectedDirectory = workflow ? "workflows" : recordTypes[type].directory;
    const id = metadata.id;
    if (metadata.type !== type) issue(`Expected record type '${type}'.`, "type");
    if (typeof id !== "string" || !new RegExp(`^${prefix}-\\d{${workflow ? "1," : "4,"}}$`).test(id)) {
      issue(`Expected a stable ${prefix} record ID.`, "id");
    } else {
      identity = { id, type, file };
      const withSlug = filename.startsWith(`${id}-`) && filename.endsWith(".md") && filename.length > id.length + 4;
      if (!workflow && filename !== `${id}.md` && !withSlug) {
        issue(`Filename must start with record ID ${id}.`, "id");
      }
    }
    if (directory !== expectedDirectory) issue(`Record must be in ${expectedDirectory}.`);
  }
  if ((type || plan) && frontmatter && (typeof metadata.status !== "string" || !metadata.status.trim())) {
    issue("Expected a nonempty status.", "status");
  }
  if (type === "story") {
    if (metadata.priority !== undefined && (typeof metadata.priority !== "number"
      || !Number.isInteger(metadata.priority) || metadata.priority < 1 || metadata.priority > 5)) {
      issue("Priority must be an integer from 1 to 5.", "priority");
    }
    if (metadata.blocked !== undefined && typeof metadata.blocked !== "boolean") {
      issue("Blocked must be a boolean.", "blocked");
    }
  }

  return {
    file, path, metadata, keys, type, identity, plan,
    body: frontmatter?.body ?? raw,
    lineOffset: frontmatter ? raw.slice(0, frontmatter.bodyStart).split("\n").length - 1 : 0,
  };
}

function documentRelationships(document: Document, identities: Map<string, Identity[]>, issues: DocumentDiagnostic[]): void {
  const { type, plan, metadata, keys, identity, path } = document;
  if (!type && !plan) return;
  const issue = (field: string, message: string) => issues.push({
    path, line: keys.get(field) ?? 1, code: "relationship", message,
  });

  function check(field: string, value: unknown, expected?: Identity["type"]): void {
    if (typeof value !== "string" || !value.trim()) {
      issue(field, `Expected a record ID in ${field}.`);
      return;
    }
    const matches = identities.get(value) ?? [];
    if (matches.length > 1) issue(field, `Ambiguous ${field} record: ${value}`);
    else if (!matches.length || (expected && matches[0].type !== expected)) {
      const label = expected === "prd" && field === "parent" ? "PRD parent" : `${field}${expected ? ` ${expected}` : ""} record`;
      issue(field, `Unknown ${label}: ${value}`);
    } else if ((field === "depends_on" || field === "blocked_by") && value === identity?.id) {
      issue(field, `A story cannot reference itself in ${field}.`);
    }
  }

  if (type === "story" || plan || metadata.parent !== undefined) {
    if (type === "story" && metadata.parent === undefined) issue("parent", "Stories require --parent <PRD-ID>.");
    else check("parent", metadata.parent, type === "story" ? "prd" : plan ? "story" : undefined);
  }
  if (type === "note" || metadata.source !== undefined) {
    if (type === "note" && metadata.source === undefined) issue("source", "Inbox notes require --source <existing-record-ID>.");
    else check("source", metadata.source);
  }
  const lists = { related: undefined, depends_on: "story", blocked_by: "story", supersedes: "adr" } as const;
  for (const [field, expected] of Object.entries(lists)) {
    const values = metadata[field];
    if (values === undefined || ((field === "depends_on" || field === "blocked_by") && values === null)) continue;
    if (!Array.isArray(values)) issue(field, `Expected a list of record IDs in ${field}.`);
    else for (const value of new Set(values)) check(field, value, expected);
  }
}

function markdownFiles(fs: FileSystem, root: string, folder: string, issues: DocumentDiagnostic[]): string[] {
  if (!fs.existsSync(folder)) return [];
  try {
    if (!fs.lstatSync(folder).isDirectory()) throw new Error("Expected a regular documentation directory.");
    const files: string[] = [];
    for (const name of fs.readdirSync(folder).sort()) {
      const file = join(folder, name);
      const status = fs.lstatSync(file);
      if (status.isDirectory()) files.push(...markdownFiles(fs, root, file, issues));
      else if (/\.md$/i.test(name) && (status.isFile() || status.isSymbolicLink())) files.push(file);
    }
    return files;
  } catch (error) {
    issues.push({
      path: documentPath(root, folder), line: 1, code: "document-read",
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function lintBody(document: Document, links: ReturnType<typeof documentLinkChecker>, issues: DocumentDiagnostic[]): void {
  const { file, path, body, lineOffset, type, plan } = document;
  const invalid = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.exec(body);
  if (invalid) {
    const line = lineOffset + body.slice(0, invalid.index).split("\n").length;
    issues.push({ path, line, code: "body-text", message: "Unexpected control character in Markdown." });
  }
  const tree = parseMarkdown(body);
  if ((type || plan) && !markdownTitle(tree)) {
    issues.push({ path, line: lineOffset + 1, code: "body-title", message: "Expected a level-one Markdown title." });
  }
  if (type === "story") {
    try {
      parseNotes(body, tree);
    } catch (error) {
      if (!(error instanceof NoteFormatError)) throw error;
      issues.push({ path, line: lineOffset + error.line, code: "task-notes", message: error.message });
    }
  }
  issues.push(...links(file, body, tree, lineOffset));
}

function indexIdentities(identities: Identity[]): Map<string, Identity[]> {
  const index = new Map<string, Identity[]>();
  for (const identity of identities) {
    const matches = index.get(identity.id);
    if (matches) matches.push(identity);
    else index.set(identity.id, [identity]);
  }
  return index;
}

function loadDocument(fs: FileSystem, root: string, file: string, issues: DocumentDiagnostic[]): Document | undefined {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Use a regular Markdown file for documentation.");
    return readDocument(root, file, fs.readFileSync(file, "utf8"), issues);
  } catch (error) {
    issues.push({
      path: documentPath(root, file), line: 1, code: "document-read",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function workflowReferences(fs: FileSystem, root: string): Identity[] {
  return markdownFiles(fs, root, join(root, "workflows"), []).flatMap((file) => {
    const issues: DocumentDiagnostic[] = [];
    const identity = loadDocument(fs, root, file, issues)?.identity;
    return identity?.type === "workflow" && !issues.length ? [identity] : [];
  });
}

export function lintDocuments(fs: FileSystem, root: string): DocumentDiagnostic[] {
  const issues: DocumentDiagnostic[] = [];
  const files = [
    ...markdownFiles(fs, root, join(root, "docs"), issues),
    ...markdownFiles(fs, root, join(root, "workflows"), issues),
  ];
  const documents = files.flatMap((file) => loadDocument(fs, root, file, issues) ?? []);
  const identities = indexIdentities(documents.flatMap((item) => item.identity ?? []));
  for (const [id, matches] of identities) {
    if (matches.length < 2) continue;
    const paths = matches.map(({ file }) => documentPath(root, file));
    for (const path of paths) {
      issues.push({ path, line: 1, code: "duplicate-id", message: `Duplicate record ID ${id} in ${paths.join(", ")}.` });
    }
  }
  const links = documentLinkChecker(fs, root);
  for (const document of documents) {
    documentRelationships(document, identities, issues);
    lintBody(document, links, issues);
  }
  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.code.localeCompare(right.code));
}

export function lintNewDocument(
  fs: FileSystem, root: string, file: string, raw: string, index: string, indexContent: string, existing: Identity[],
): DocumentDiagnostic[] {
  const issues: DocumentDiagnostic[] = [];
  const candidate = readDocument(root, file, raw, issues);
  const category = readDocument(root, index, indexContent, issues);
  if (!candidate || !category) return issues;
  const identities = indexIdentities([
    ...existing, ...workflowReferences(fs, root), ...(candidate.identity ? [candidate.identity] : []),
  ]);
  documentRelationships(candidate, identities, issues);
  const links = documentLinkChecker(fs, root, new Map([[file, raw], [index, indexContent]]));
  lintBody(candidate, links, issues);
  lintBody(category, links, issues);
  return issues;
}

export function lintDocumentBody(fs: FileSystem, root: string, file: string, raw: string): DocumentDiagnostic[] {
  const issues: DocumentDiagnostic[] = [];
  const document = readDocument(root, file, raw, issues);
  if (document) lintBody(document, documentLinkChecker(fs, root, new Map([[file, raw]])), issues);
  return issues;
}
