import type { FileSystem } from "./fs.js";
import { findRecord, listRecords, type RecordEntry, type RecordType } from "./records.js";
import { knowledgeAddTypes, knowledgeTypes } from "./record-types.js";
import { isCalendarDate, matchesRecord, recordBody, searchRecords, storyById, walkDependencies } from "./record-query.js";
import { taskBlockers } from "./task.js";

type Command = "knowledge" | "work";
type Flags = Readonly<Record<string, string | boolean>>;

const recordFields = ["id", "title", "type", "status", "body"] as const;
const metadataFields = [
  "parent", "priority", "related", "source", "supersedes", "depends_on", "blocked_by", "created_at", "accepted_at",
];
const filterFlags = [
  "type", "status", "parent", "related-to", "source", "supersedes",
  "created-since", "created-before", "accepted-since", "accepted-before", "fields", "limit",
];
const workFilters = ["priority", "depends-on", "dependencies-of", "transitive"];
const booleanFlags = ["json", "body", "transitive"];

export function recordCommandHelp(command: Command): string {
  const prefix = `agentctl ${command}`;
  return [
    `${prefix} search TEXT [filters] [--fields LIST] [--limit N] [--json]`,
    `${prefix} list [filters] [--fields LIST] [--limit N] [--json]`,
    `${prefix} show ID [--body] [--json]`,
    ...(command === "knowledge" ? [
      `${prefix} add --type ${knowledgeAddTypes.join("|")} --title TEXT [--related ID[,ID...]]`,
      `${prefix} capture TEXT --source ID`,
      "",
      `Record types for lists and search: --type ${knowledgeTypes.join("|")}.`,
      "Use research for evidence and findings, brainstorm for ideas, and adr for architectural decisions.",
    ] : [
      `${prefix} blockers STORY-ID [--json]`,
      `${prefix} add --title TEXT --parent PRD-ID`,
      "",
      "--priority 1..5 matches story priority (default 3).",
      "--depends-on STORY-ID finds stories that depend on this story.",
      "--dependencies-of STORY-ID finds stories this story depends on.",
      "--transitive includes indirect links. Both directions include depends_on and blocked_by.",
    ]),
    "Filters combine with AND: --status STATUS, --parent ID, --related-to ID, --source ID, --supersedes ID.",
    "Relationship filters match the IDs recorded in frontmatter.",
    "--created-since, --accepted-since include the date (YYYY-MM-DD).",
    "--created-before, --accepted-before exclude the date. Undated records are skipped.",
    "--fields takes comma-separated names: " + [...recordFields, ...metadataFields].join(", ") + ".",
    "Search also supports the excerpt field. Search defaults to 10 results. Lists can use --limit.",
    "--body returns the Markdown body without YAML frontmatter.",
    "",
    "Examples:",
    ...(command === "knowledge" ? [
      `  ${prefix} search "task claims" --type adr --status accepted`,
      `  ${prefix} show ADR-0001 --body`,
    ] : [
      `  ${prefix} list --parent PRD-0001 --status proposed`,
      `  ${prefix} list --dependencies-of STORY-0001 --fields id,title,body`,
    ]),
  ].join("\n");
}

function validateFlags(flags: Flags, allowed: readonly string[]): void {
  for (const [name, value] of Object.entries(flags)) {
    if (name !== "json" && !allowed.includes(name)) throw new Error(`Unknown option: --${name}`);
    if (booleanFlags.includes(name)) {
      if (value !== true) throw new Error(`--${name} does not take a value.`);
    } else if (typeof value !== "string" || !value.trim()) {
      throw new Error(`--${name} requires a value.`);
    }
  }
}

function valueOf(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function integerOption(flags: Flags, name: string, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const value = valueOf(flags, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < 1 || number > max) {
    throw new Error(max === Number.MAX_SAFE_INTEGER ? `--${name} requires a positive integer.` : `--${name} requires an integer from 1 to ${max}.`);
  }
  return number;
}

function dateOption(flags: Flags, name: string): string | undefined {
  const value = valueOf(flags, name);
  if (value !== undefined && !isCalendarDate(value)) throw new Error(`--${name} requires a valid YYYY-MM-DD date.`);
  return value;
}

function listType(command: Command, value?: string): RecordType | undefined {
  if (command === "work") {
    if (value && value !== "story") throw new Error("Use --type story with work commands.");
    return "story";
  }
  if (!value) return undefined;
  const type = knowledgeTypes.find((type) => type === value);
  if (!type) throw new Error(`Use --type ${knowledgeTypes.join("|")} with knowledge commands.`);
  return type;
}

function selectedFields(value: string | undefined, searching: boolean): string[] | undefined {
  if (!value) return undefined;
  const fields = [...new Set(value.split(",").map((field) => field.trim()))];
  const allowed = [...recordFields, ...metadataFields, ...(searching ? ["excerpt"] : [])];
  const invalid = fields.findIndex((field) => !allowed.includes(field));
  if (invalid >= 0) throw new Error(`Unknown result field: ${fields[invalid] || "(empty)"}`);
  return fields;
}

function projectFields(record: RecordEntry, fields: readonly string[], excerpt?: string): Record<string, unknown> {
  const values = { id: record.id, title: record.title, status: record.status, type: record.type, excerpt };
  return Object.fromEntries(fields.map((field) => {
    if (field === "body") return [field, recordBody(record)];
    const value = Object.hasOwn(values, field) ? values[field as keyof typeof values] : record.metadata[field];
    return [field, value ?? null];
  }));
}

function renderFields(row: Record<string, unknown>): string {
  const { body, ...columns } = row;
  const line = Object.values(columns).map((value) => {
    const text = Array.isArray(value) ? value.join(",") : String(value ?? "");
    return text || "-";
  }).join("\t");
  return [line, typeof body === "string" ? body.trimEnd() || "-" : ""].filter(Boolean).join("\n");
}

function readList(
  fs: FileSystem, root: string, command: Command, action: "list" | "search", args: string[], flags: Flags,
): unknown {
  const searching = action === "search";
  if (args.length !== (searching ? 1 : 0)) {
    throw new Error(`Usage: agentctl ${command} ${action}${searching ? " TEXT" : ""} [filters]`);
  }
  validateFlags(flags, command === "work" ? [...filterFlags, ...workFilters] : filterFlags);
  const type = listType(command, valueOf(flags, "type"));
  const fields = selectedFields(valueOf(flags, "fields"), searching);
  const limit = integerOption(flags, "limit") ?? (searching ? 10 : undefined);
  const filters = {
    status: valueOf(flags, "status"),
    parent: valueOf(flags, "parent"),
    priority: integerOption(flags, "priority", 5),
    relatedTo: valueOf(flags, "related-to"),
    source: valueOf(flags, "source"),
    supersedes: valueOf(flags, "supersedes"),
    createdSince: dateOption(flags, "created-since"),
    createdBefore: dateOption(flags, "created-before"),
    acceptedSince: dateOption(flags, "accepted-since"),
    acceptedBefore: dateOption(flags, "accepted-before"),
  };
  const dependency = valueOf(flags, "depends-on");
  const dependent = valueOf(flags, "dependencies-of");
  if (dependency && dependent) throw new Error("Use either --depends-on or --dependencies-of.");
  const anchor = dependency ?? dependent;
  if (flags.transitive && !anchor) throw new Error("--transitive requires --depends-on or --dependencies-of.");

  const records = type
    ? listRecords(fs, root, type)
    : knowledgeTypes.flatMap((kind) => listRecords(fs, root, kind)).sort((left, right) => left.id.localeCompare(right.id));
  const linked = anchor && walkDependencies(records, anchor, dependency ? "dependents" : "dependencies", flags.transitive === true);
  const filtered = records.filter((record) => (!linked || linked.has(record.id)) && matchesRecord(record, filters));
  const matches = searching ? searchRecords(filtered, args[0]) : filtered.map((record) => ({ record, excerpt: "" }));
  const results = matches.slice(0, limit);
  const hasMore = results.length < matches.length;
  const defaultFields = searching ? ["id", "title", "type", "status", "excerpt"]
    : command === "knowledge" ? ["id", "title", "type", "status"] : ["id", "title", "status", "parent"];
  if (flags.json) {
    const rows = results.map(({ record, excerpt }) => {
      const row = projectFields(record, fields ?? defaultFields, excerpt);
      if (!fields && command === "work" && !searching && record.metadata.parent === undefined) delete row.parent;
      return row;
    });
    return limit === undefined ? rows : { results: rows, total: matches.length, hasMore };
  }

  const lines = results.map(({ record, excerpt }) => {
    if (fields) return renderFields(projectFields(record, fields, excerpt));
    const prefix = `${record.id}: `;
    const title = searching && record.title.startsWith(prefix) ? record.title.slice(prefix.length) : record.title;
    const heading = `${record.id} [${record.status}] ${title}`;
    return excerpt ? `${heading}\n  ${excerpt}` : heading;
  });
  if (hasMore) lines.push(`Showing ${results.length} of ${matches.length} matches. Increase --limit for more.`);
  const empty = searching ? "No matches." : command === "knowledge" ? "No knowledge records." : "No stories.";
  return lines.join(fields?.includes("body") ? "\n\n" : "\n") || empty;
}

export function readRecordCommand(
  fs: FileSystem, root: string, command: Command, action: string, args: string[], flags: Flags,
): unknown {
  if (action === "list" || action === "search") return readList(fs, root, command, action, args, flags);

  if (args.length !== 1 || !args[0]) throw new Error(`Usage: agentctl ${command} ${action} ID`);
  const [id] = args;
  if (action === "blockers") {
    validateFlags(flags, []);
    const records = listRecords(fs, root);
    const task = storyById(records, id);
    const reasons = taskBlockers(task, new Map(records.map((record) => [record.id, record])));
    return flags.json ? { id, reasons } : reasons.length ? reasons.join("\n") : `No blockers for ${id}.`;
  }

  validateFlags(flags, ["body"]);
  const record = findRecord(fs, root, id);
  if (command === "work" && record.type !== "story") throw new Error(`Not a story: ${record.id}`);
  if (flags.body) return recordBody(record);
  return flags.json ? record : fs.readFileSync(record.file, "utf8");
}
