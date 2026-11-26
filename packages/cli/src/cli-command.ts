import type { Flags, SectionArgument } from "./cli-arguments.js";
import type { FileSystem } from "./fs.js";
import type { RunCommand } from "./verify.js";

export type CommandDefinition = {
  name: string;
  summary: string;
  syntax?: string;
  details?: string | ((flags: Flags) => string);
  children?: readonly CommandDefinition[];
  leadingArgument?: string;
  forwardsArguments?: boolean;
  acceptsSections?: boolean;
  standalone?: boolean;
  run?: (context: CommandContext) => number;
};

type CommandContext = {
  args: string[];
  leadingArgs: string[];
  forwardedArgs: string[];
  flags: Flags;
  sections: SectionArgument[];
  usage: string;
  fs: FileSystem;
  root: string;
  cwd: string;
  templates: string;
  runner: RunCommand;
  stdin: () => string;
  json: boolean;
  emit: (value: unknown) => void;
  output: (value: string) => void;
};

type CommandMatch = {
  command: CommandDefinition;
  path: string;
  args: string[];
  leadingArgs: string[];
};

function commandSegment(command: CommandDefinition): string {
  return command.leadingArgument ? `[${command.leadingArgument}] ${command.name}` : command.name;
}

export function matchCommand(root: CommandDefinition, positionals: string[]): CommandMatch {
  let command = root;
  let path = root.name;
  let index = 0;
  const leadingArgs: string[] = [];
  while (index < positionals.length && command.children) {
    const name = positionals[index];
    const child = command.children.find((entry) =>
      entry.name === name || (entry.leadingArgument && entry.name === positionals[index + 1]));
    if (!child) break;
    if (child.name !== name) leadingArgs.push(positionals[index++]);
    index++;
    command = child;
    path += ` ${commandSegment(child)}`;
  }
  return { command, path, args: positionals.slice(index), leadingArgs };
}

export function commandUsage({ command, path }: Pick<CommandMatch, "command" | "path">): string {
  const syntax = command.syntax ?? (command.children ? "<command> [args]" : "");
  return syntax ? `${path} ${syntax}` : path;
}

export function commandHelp(match: CommandMatch, flags: Flags): string {
  const { command, path } = match;
  const details = typeof command.details === "function" ? command.details(flags) : command.details;
  const manual = [`Usage: ${commandUsage(match)}`, command.summary];
  if (command.children) {
    const entries = command.children.map((child) => {
      const childPath = `${path} ${commandSegment(child)}`;
      const usage = commandUsage({ command: child, path: childPath }).split("\n")[0];
      return `  ${usage}\n    ${child.summary}`;
    });
    manual.push(["Commands", ...entries].join("\n"));
  }
  if (details) manual.push(details);
  if (command.children) manual.push("Use -h or --help after a command to see its usage.");
  return manual.join("\n\n");
}
