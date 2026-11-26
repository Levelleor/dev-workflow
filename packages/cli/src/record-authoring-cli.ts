import { resolve } from "node:path";
import type { FileSystem } from "./fs.js";
import { knowledgeAddTypes, recordTypes, type RecordType } from "./record-types.js";

export function recordCreationHelp(kind: "work" | "knowledge" | "capture", type?: string): string {
  const command = kind === "work" ? "work add" : kind === "capture" ? "knowledge capture" : "knowledge add";
  const metadata = kind === "work" ? "--title TEXT --parent PRD-ID [--depends-on ID[,ID...]] [--blocked-by ID[,ID...]]"
    : kind === "capture" ? "TITLE --source ID" : `--type ${knowledgeAddTypes.join("|")} --title TEXT [--related ID[,ID...]]`;
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
    `Usage: agentctl ${command} ${metadata}`,
    "       [--section NAME=TEXT] [--section-file NAME=PATH|-] [--json]",
    "",
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

export type SectionArgument = { flag: "section" | "section-file"; value: string | undefined };

export function readSections(
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
