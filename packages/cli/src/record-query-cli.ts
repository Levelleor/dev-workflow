import { flag, type Flags } from "./cli-arguments.js";
import type { CommandDefinition } from "./cli-command.js";
import type { FileSystem } from "./fs.js";
import { findRecord, listRecords, type RecordEntry, type RecordType } from "./records.js";
import { knowledgeTypes } from "./record-types.js";
import { isCalendarDate, matchesRecord, recordBody, searchRecords, storyById, walkDependencies } from "./record-query.js";
import { taskBlockers } from "./task.js";

type RecordGroup = "knowledge" | "work";

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

function filterHelp(group: RecordGroup): string {
  return [
    ...(group === "knowledge" ? [
      `Record types for lists and search: --type ${knowledgeTypes.join("|")}.`,
      "Use research for evidence and findings, brainstorm for ideas, and adr for architectural decisions.",
    ] : [
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
  ].join("\n");
}

const bodyHelp = "--body returns the Markdown body without YAML frontmatter.";

function listExample(group: RecordGroup): string {
  return group === "work" ? "agentctl work list --dependencies-of STORY-0001 --fields id,title,body"
    : "agentctl knowledge list --type note --source STORY-0001";
}

function searchExample(group: RecordGroup): string {
  return group === "work" ? 'agentctl work search "verification gate" --parent PRD-0001'
    : 'agentctl knowledge search "task claims" --type adr --status accepted';
}

export function recordLookupDetails(group: RecordGroup): string {
  return [
    filterHelp(group),
    "Search also supports the excerpt field and defaults to 10 results. Lists can use --limit.",
    bodyHelp,
    "",
    "Examples",
    `  ${searchExample(group)}`,
    `  ${listExample(group)}`,
    `  agentctl ${group} show ${group === "work" ? "STORY-0001" : "ADR-0001"} --body`,
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

function integerOption(flags: Flags, name: string, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const value = flag(flags, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < 1 || number > max) {
    throw new Error(max === Number.MAX_SAFE_INTEGER ? `--${name} requires a positive integer.` : `--${name} requires an integer from 1 to ${max}.`);
  }
  return number;
}

function dateOption(flags: Flags, name: string): string | undefined {
  const value = flag(flags, name);
  if (value !== undefined && !isCalendarDate(value)) throw new Error(`--${name} requires a valid YYYY-MM-DD date.`);
  return value;
}

function listType(command: RecordGroup, value?: string): RecordType | undefined {
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
  fs: FileSystem, root: string, command: RecordGroup, action: "list" | "search", args: string[], flags: Flags, usage: string,
): unknown {
  const searching = action === "search";
  if (args.length !== (searching ? 1 : 0)) throw new Error(`Usage: ${usage}`);
  validateFlags(flags, command === "work" ? [...filterFlags, ...workFilters] : filterFlags);
  const type = listType(command, flag(flags, "type"));
  const fields = selectedFields(flag(flags, "fields"), searching);
  const limit = integerOption(flags, "limit") ?? (searching ? 10 : undefined);
  const filters = {
    status: flag(flags, "status"),
    parent: flag(flags, "parent"),
    priority: integerOption(flags, "priority", 5),
    relatedTo: flag(flags, "related-to"),
    source: flag(flags, "source"),
    supersedes: flag(flags, "supersedes"),
    createdSince: dateOption(flags, "created-since"),
    createdBefore: dateOption(flags, "created-before"),
    acceptedSince: dateOption(flags, "accepted-since"),
    acceptedBefore: dateOption(flags, "accepted-before"),
  };
  const dependency = flag(flags, "depends-on");
  const dependent = flag(flags, "dependencies-of");
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

export function recordLookupCommands(group: RecordGroup): CommandDefinition[] {
  return [
    {
      name: "list",
      summary: "List records matching the supplied filters.",
      syntax: "[filters] [--fields LIST] [--limit N] [--json]",
      details: `${filterHelp(group)}\n\nExample: ${listExample(group)}`,
      run({ fs, root, args, flags, emit, usage }) {
        emit(readList(fs, root, group, "list", args, flags, usage));
        return 0;
      },
    },
    {
      name: "search",
      summary: "Search record IDs, titles, and bodies.",
      syntax: "TEXT [filters] [--fields LIST] [--limit N] [--json]",
      details: [
        filterHelp(group),
        "Search ranks matches and includes a short excerpt. It defaults to 10 results.",
        "The excerpt field is also available with --fields.",
        "",
        `Example: ${searchExample(group)}`,
      ].join("\n"),
      run({ fs, root, args, flags, emit, usage }) {
        emit(readList(fs, root, group, "search", args, flags, usage));
        return 0;
      },
    },
    {
      name: "show",
      summary: "Read one record by stable ID.",
      syntax: "ID [--body] [--json]",
      details: `${bodyHelp} Use --json for structured output.`,
      run({ fs, root, args, flags, emit, usage }) {
        if (args.length !== 1 || !args[0]) throw new Error(`Usage: ${usage}`);
        validateFlags(flags, ["body"]);
        const record = findRecord(fs, root, args[0]);
        if (group === "work" && record.type !== "story") throw new Error(`Not a story: ${record.id}`);
        emit(flags.body ? recordBody(record) : flags.json ? record : fs.readFileSync(record.file, "utf8"));
        return 0;
      },
    },
  ];
}

export const workBlockersCommand: CommandDefinition = {
  name: "blockers",
  summary: "Explain what blocks a story from being claimed.",
  syntax: "STORY-ID [--json]",
  details: "Uses the same dependency and eligibility rules as task claim.",
  run({ fs, root, args, flags, emit, usage }) {
    if (args.length !== 1 || !args[0]) throw new Error(`Usage: ${usage}`);
    validateFlags(flags, []);
    const [id] = args;
    const records = listRecords(fs, root);
    const task = storyById(records, id);
    const reasons = taskBlockers(task, new Map(records.map((record) => [record.id, record])));
    emit(flags.json ? { id, reasons } : reasons.length ? reasons.join("\n") : `No blockers for ${id}.`);
    return 0;
  },
};
