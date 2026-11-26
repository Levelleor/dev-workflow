import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { argumentsOf } from "./cli-arguments.js";
import { commandHelp, commandUsage, matchCommand, type CommandDefinition } from "./cli-command.js";
import { disk, type FileSystem } from "./fs.js";
import { configCommand, projectCommands } from "./project-cli.js";
import { findProjectRoot } from "./project.js";
import { knowledgeAddCommand, knowledgeCaptureCommand, workAddCommand } from "./record-authoring-cli.js";
import { recordLookupCommands, recordLookupDetails, workBlockersCommand } from "./record-query-cli.js";
import { taskCommand } from "./task-cli.js";
import { verifyCommand } from "./verify-cli.js";
import { runCommand, type RunCommand } from "./verify.js";

export type CliOptions = {
  cwd?: string;
  fs?: FileSystem;
  templates?: string;
  runner?: RunCommand;
  stdin?: () => string;
  output?: (message: string) => void;
  error?: (message: string) => void;
};

const helpCommand: CommandDefinition = {
  name: "help",
  summary: "Show usage for a command or subcommand.",
  syntax: "[COMMAND [SUBCOMMAND ...]]",
  details: "You can also pass -h or --help to the command. Example: agentctl help knowledge add",
  standalone: true,
  run({ args, flags, output }) {
    output(commandHelp(matchCommand(rootCommand, args), flags));
    return 0;
  },
};

const versionCommand: CommandDefinition = {
  name: "version",
  summary: "Print the agentctl version. Also available as --version.",
  standalone: true,
  run({ output }) {
    output("agentctl 0.1.0");
    return 0;
  },
};

const rootCommand: CommandDefinition = {
  name: "agentctl",
  summary: "Repository-backed coding-agent development workflow.",
  syntax: "[COMMAND [ARGS...]]",
  children: [
    ...projectCommands,
    taskCommand,
    {
      name: "work",
      summary: "Find, inspect, and create stories.",
      details: recordLookupDetails("work"),
      children: [...recordLookupCommands("work"), workBlockersCommand, workAddCommand],
    },
    {
      name: "knowledge",
      summary: "Find, inspect, and create knowledge records.",
      details: recordLookupDetails("knowledge"),
      children: [...recordLookupCommands("knowledge"), knowledgeAddCommand, knowledgeCaptureCommand],
    },
    configCommand,
    verifyCommand,
    helpCommand,
    versionCommand,
  ],
};

function readStdin(): string {
  if (process.stdin.isTTY) throw new Error("Pipe Markdown to stdin or use a quoted heredoc.");
  return readFileSync(0, "utf8");
}

export function runCli(argv: string[], options: CliOptions = {}): number {
  const fs = options.fs ?? disk;
  const cwd = options.cwd ?? process.cwd();
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;

  try {
    const { args, flags, sections, afterOptions } = argumentsOf(argv);
    const positionals = flags.version === true ? ["version"] : args;
    const initialMatch = matchCommand(rootCommand, positionals);
    const match = afterOptions.length && !initialMatch.command.forwardsArguments
      ? matchCommand(rootCommand, [...positionals, ...afterOptions])
      : initialMatch;
    const { command } = match;

    if ((!positionals.length && !afterOptions.length) || (flags.help === true && flags.version !== true)) {
      const topic = command === helpCommand && match.args.length ? matchCommand(rootCommand, match.args) : match;
      output(commandHelp(topic, flags));
      return 0;
    }
    if (sections.length && !command.acceptsSections && command !== helpCommand && command !== versionCommand) {
      throw new Error(`Unknown option: --${sections[0].flag}. Section input is available on record creation commands.`);
    }

    const root = command.standalone ? cwd : findProjectRoot(fs, cwd);
    if (command === rootCommand) throw new Error(`Unknown command: ${match.args[0]}. Try 'agentctl --help'.`);
    if (!command.run) throw new Error(commandHelp(match, flags));

    const json = flags.json === true;
    const emit = (value: unknown) => output(json || typeof value !== "string" ? JSON.stringify(value, null, 2) : value);
    return command.run({
      args: match.args, leadingArgs: match.leadingArgs,
      forwardedArgs: initialMatch.command.forwardsArguments ? afterOptions : [],
      flags, sections, usage: commandUsage(match), fs, root, cwd, json, emit, output,
      templates: options.templates ?? fileURLToPath(new URL("./templates/repository/", import.meta.url)),
      runner: options.runner ?? runCommand,
      stdin: options.stdin ?? readStdin,
    });
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
