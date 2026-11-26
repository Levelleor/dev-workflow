export type Flags = Readonly<Record<string, string | boolean>>;
export type SectionArgument = { flag: "section" | "section-file"; value: string | undefined };

const optionAliases = new Map([["-h", "--help"]]);

export function argumentsOf(argv: string[]): {
  args: string[];
  flags: Flags;
  sections: SectionArgument[];
  afterOptions: string[];
} {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = Object.create(null);
  const sections: SectionArgument[] = [];
  const delimiter = argv.indexOf("--");
  const end = delimiter < 0 ? argv.length : delimiter;
  for (let i = 0; i < end; i++) {
    const token = optionAliases.get(argv[i]) ?? argv[i];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const name = separator < 0 ? token.slice(2) : token.slice(2, separator);
    const inline = separator < 0 ? undefined : token.slice(separator + 1);
    if (!/^[a-z][\w-]*$/.test(name)) throw new Error(`Invalid option: ${token}`);
    const boolean = ["json", "help", "version", "body", "transitive"].includes(name);
    const value = inline ?? (!boolean && i + 1 < end && !argv[i + 1].startsWith("-") ? argv[++i] : undefined);
    if (name === "section" || name === "section-file") sections.push({ flag: name, value });
    else flags[name] = value ?? true;
  }
  return { args, flags, sections, afterOptions: argv.slice(end + 1) };
}

export function flag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Missing argument. Usage: ${usage}`);
  return value;
}

export function idList(flags: Flags, name: string): string[] | undefined {
  if (!Object.hasOwn(flags, name)) return undefined;
  const ids = flag(flags, name)?.split(",").map((id) => id.trim());
  if (!ids || ids.some((id) => !id)) throw new Error(`--${name} requires a comma-separated list of record IDs.`);
  return [...new Set(ids)];
}
