import { resolve } from "node:path";
import { flag, idList, requireArg, type SectionArgument } from "./cli-arguments.js";
import type { CommandDefinition } from "./cli-command.js";
import type { FileSystem } from "./fs.js";
import { addRecord } from "./records.js";
import { knowledgeAddTypes, recordTypes, type RecordType } from "./record-types.js";

const sectionOptions = "\n       [--section NAME=TEXT] [--section-file NAME=PATH|-] [--json]";
const knowledgeTypesOption = `--type ${knowledgeAddTypes.join("|")}`;

function recordCreationDetails(kind: "work" | "knowledge" | "capture", type?: string): string {
  const selected = knowledgeAddTypes.find((candidate) => candidate === type);
  const types: readonly RecordType[] = kind === "work" ? ["story"] : kind === "capture" ? ["note"]
    : selected ? [selected] : knowledgeAddTypes;
  const examples = kind === "work" ? [
    '  agentctl work add --title "Improve retries" --parent PRD-0001 \\',
    "    --section 'outcome=Retry transient errors.' --section-file acceptance-criteria=criteria.md",
  ] : kind === "capture" ? [
    '  agentctl knowledge capture "Retry behavior" --source STORY-0001 \\',
    "    --section-file discovery=details.md",
  ] : [
    '  agentctl knowledge add --type adr --title "Choose SQLite" \\',
    "    --section 'decision=Use SQLite.' --section-file context=context.md",
    "",
    '  agentctl knowledge add --type research --title "Storage options" \\',
    "    --section-file findings=- <<'MARKDOWN'",
    "> SQLite's WAL mode allows concurrent readers.",
    'See the `journal_mode` setting for details.',
    "MARKDOWN",
  ];
  return [
    "Supply metadata with the flags above. agentctl generates the record ID, frontmatter, and section headings.",
    ...(kind === "knowledge" ? [
      "Use --related with existing record IDs. Add --type adr to this help command to show only ADR section names.",
    ] : []),
    "--section NAME=TEXT inserts inline Markdown. Quote the entire NAME=TEXT argument.",
    "--section-file NAME=PATH reads Markdown from a file relative to the current directory.",
    "--section-file NAME=- reads one section from stdin, for example with the quoted heredoc below.",
    "Repeat these options for different sections. Omitted sections start empty.",
    "Use Markdown lists, quotes, code fences, links, and headings of level three or deeper inside sections.",
    "Resolve links from the generated record's directory. See the returned path or use show ID --body to read it.",
    ...(kind === "work" ? ["Use agentctl task notes add for the managed Notes section."] : []),
    "",
    "Available sections by type and output directory",
    ...types.map((name) => `  ${name} (${recordTypes[name].directory}/)  ${Object.keys(recordTypes[name].sections).join(", ")}`),
    "",
    "Examples",
    ...examples,
  ].join("\n");
}

function readSections(
  type: RecordType, args: SectionArgument[], fs: FileSystem, cwd: string, stdin: () => string,
): Map<string, string> {
  const names = new Set<string>();
  let stdinUsed = false;
  const inputs = args.map(({ flag, value }) => {
    const separator = value?.indexOf("=") ?? -1;
    if (value === undefined || separator < 1 || separator === value.length - 1) {
      throw new Error(`--${flag} requires ${flag === "section" ? "NAME=TEXT" : "NAME=PATH|-"}.`);
    }
    const name = value.slice(0, separator);
    const content = value.slice(separator + 1);
    if (!Object.hasOwn(recordTypes[type].sections, name)) {
      throw new Error(`Unknown section '${name}' for ${type}. Use ${Object.keys(recordTypes[type].sections).join(", ")}.`);
    }
    if (names.has(name)) throw new Error(`Section '${name}' was supplied more than once.`);
    names.add(name);
    if (flag === "section-file" && content === "-") {
      if (stdinUsed) throw new Error("Only one section can read from stdin.");
      stdinUsed = true;
    }
    return { flag, name, content };
  });
  return new Map(inputs.map(({ flag, name, content }) => {
    if (flag === "section") return [name, content];
    try {
      return [name, content === "-" ? stdin() : fs.readFileSync(resolve(cwd, content), "utf8")];
    } catch (error) {
      throw new Error(`Cannot read section '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
}

export const workAddCommand: CommandDefinition = {
  name: "add",
  summary: "Create a story under a product requirement.",
  syntax: "--title TEXT --parent PRD-ID [--depends-on ID[,ID...]] [--blocked-by ID[,ID...]]" + sectionOptions,
  details: () => recordCreationDetails("work"),
  acceptsSections: true,
  run({ args, flags, sections, fs, root, cwd, stdin, json, emit, usage }) {
    if (args.length) throw new Error("Unexpected argument. See 'agentctl work add -h'.");
    const record = addRecord(fs, root, {
      type: "story", title: requireArg(flag(flags, "title"), usage),
      parent: flag(flags, "parent"),
      dependsOn: idList(flags, "depends-on"), blockedBy: idList(flags, "blocked-by"),
      sections: readSections("story", sections, fs, cwd, stdin),
    });
    emit(json ? record : `Created ${record.id}: ${record.file}`);
    return 0;
  },
};

export const knowledgeAddCommand: CommandDefinition = {
  name: "add",
  summary: "Create a knowledge record with a selected type.",
  syntax: `${knowledgeTypesOption} --title TEXT [--related ID[,ID...]]` + sectionOptions,
  details: (flags) => recordCreationDetails("knowledge", flag(flags, "type")),
  acceptsSections: true,
  run({ args, flags, sections, fs, root, cwd, stdin, json, emit, usage }) {
    if (args.length) throw new Error("Unexpected argument. See 'agentctl knowledge add -h'.");
    const type = knowledgeAddTypes.find((candidate) => candidate === flag(flags, "type"));
    if (!type) throw new Error(`Use ${knowledgeTypesOption}.`);
    const title = requireArg(flag(flags, "title"), usage);
    const record = addRecord(fs, root, {
      type, title, related: idList(flags, "related"),
      sections: readSections(type, sections, fs, cwd, stdin),
    });
    emit(json ? record : `Created ${record.id}: ${record.file}`);
    return 0;
  },
};

export const knowledgeCaptureCommand: CommandDefinition = {
  name: "capture",
  summary: "Capture a discovery as a note linked to a source record.",
  syntax: "TITLE --source ID" + sectionOptions,
  details: () => recordCreationDetails("capture"),
  acceptsSections: true,
  run({ args, flags, sections, fs, root, cwd, stdin, json, emit, usage }) {
    if (args.length > 1) throw new Error("Unexpected argument. See 'agentctl knowledge capture -h'.");
    const record = addRecord(fs, root, {
      type: "note", title: requireArg(args[0], usage), source: flag(flags, "source"),
      sections: readSections("note", sections, fs, cwd, stdin),
    });
    emit(json ? record : `Captured ${record.id}: ${record.file}`);
    return 0;
  },
};
