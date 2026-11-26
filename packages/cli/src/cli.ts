import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystem } from "./fs.js";
import { disk } from "./fs.js";
import { findProjectRoot, initProject, readYaml } from "./project.js";
import { addRecord, listRecords } from "./records.js";
import { knowledgeAddTypes } from "./record-types.js";
import { readSections, recordCreationHelp, type SectionArgument } from "./record-authoring-cli.js";
import { readRecordCommand, recordCommandHelp } from "./record-query-cli.js";
import { lintDocuments } from "./documents.js";
import { formatDiagnostic } from "./document-links.js";
import { getSetting, setSetting, showConfig } from "./config.js";
import { addGate, listGates, runCommand, verify, type RunCommand } from "./verify.js";
import { addTaskNote, listTaskNotes, removeTaskNote } from "./task-notes.js";
import { claimTask, completeTask, getActiveTaskContext } from "./task.js";

export type CliOptions = {
  cwd?: string;
  fs?: FileSystem;
  templates?: string;
  runner?: RunCommand;
  stdin?: () => string;
  output?: (message: string) => void;
  error?: (message: string) => void;
};

const help = `agentctl: repository-backed coding-agent development workflow

Usage:
  agentctl init [directory]                         Safely install project files
  agentctl doctor                                   Inspect project setup and documents
  agentctl docs lint [--json]                        Check document structure and repository links
  agentctl status [--json]                          Show task counts
  agentctl task claim <ID|next> [--json]            Claim a task, returning its ID and status
  Example: agentctl task claim next                  Select automatically by priority
  agentctl task getcontext [ID] [--json]            Resume an in-progress task
  agentctl task complete [ID] [--json]              Mark an in-progress task implemented
  agentctl task notes add "text" [--json]            Add a note to the current task
  agentctl task notes list [--json]                  List notes on the current task
  agentctl task notes remove N001                    Remove a task note
  agentctl task STORY-0001 notes add|list|remove     Address a task by stable ID
  agentctl work list|search TEXT|show ID|blockers ID|add
  agentctl knowledge list|search TEXT|show ID|add|capture
  agentctl knowledge --help | agentctl work --help    Show lookup options and examples
  agentctl knowledge add -h | agentctl work add -h    Show creation options and section examples
  agentctl config show|get KEY|set KEY VALUE
  agentctl verify [--json]                          Run every registered gate
  agentctl verify list [--json]                     List verification gates
  agentctl verify <gate> [--json]                   Run one named gate
  agentctl verify add <gate> [--timeout N] -- CMD   Register a shell command as a gate
  agentctl verify --profile NAME [--json]          Run an existing check profile
  agentctl help | --help | --version

Task lifecycle: pending/ready -> in-progress -> implemented (not verified).
Task IDs use stable STORY-0001 format and are positional across task commands.
'next' uses priority 1..5 (1 highest, default 3), then stable ID.
Claiming an explicit ID bypasses priority but still checks dependencies and ownership.
Dependencies must be implemented/completed/accepted; proposed tasks cannot be claimed.
Only one in-progress task per working tree. Unavailable claims explain why (exit 2).
--json outputs structured context or diagnostics for calling agents.
Verify gates use exit status 0 for success; failures return exit status 1.
Gate registration never replaces an existing gate. Use -- before its command.
Task notes are versioned in each story's Markdown and included in task context.
Project and task documentation stays in Git; Ultracode execution is separate.
`;

type Flag = string | boolean;
function argumentsOf(argv: string[]): { args: string[]; flags: Record<string, Flag>; sections: SectionArgument[] } {
  const args: string[] = [];
  const flags: Record<string, Flag> = Object.create(null);
  const sections: SectionArgument[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "-h") {
      flags.help = true;
      continue;
    }
    if (!token.startsWith("--") || token === "--") {
      args.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const name = separator < 0 ? token.slice(2) : token.slice(2, separator);
    const inline = separator < 0 ? undefined : token.slice(separator + 1);
    if (!/^[a-z][\w-]*$/.test(name)) throw new Error(`Invalid option: ${token}`);
    const boolean = ["json", "help", "version", "body", "transitive"].includes(name);
    const value = inline ?? (!boolean && i + 1 < argv.length && !argv[i + 1].startsWith("-") ? argv[++i] : undefined);
    if (name === "section" || name === "section-file") sections.push({ flag: name, value });
    else flags[name] = value ?? true;
  }
  return { args, flags, sections };
}

function flag(flags: Record<string, Flag>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Missing argument. Usage: ${usage}`);
  return value;
}

function idList(flags: Record<string, Flag>, name: string): string[] | undefined {
  if (!Object.hasOwn(flags, name)) return undefined;
  const ids = flag(flags, name)?.split(",").map((id) => id.trim());
  if (!ids || ids.some((id) => !id)) throw new Error(`--${name} requires a comma-separated list of record IDs.`);
  return [...new Set(ids)];
}

function readStdin(): string {
  if (process.stdin.isTTY) throw new Error("Pipe Markdown to stdin or use a quoted heredoc.");
  return readFileSync(0, "utf8");
}

export function runCli(argv: string[], options: CliOptions = {}): number {
  const fs = options.fs ?? disk;
  const cwd = options.cwd ?? process.cwd();
  const templates = options.templates ?? fileURLToPath(new URL("./templates/repository/", import.meta.url));
  const runner = options.runner ?? runCommand;
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;

  try {
    // Everything after '--' in verify add belongs to the registered command.
    const separator = argv[0] === "verify" && argv[1] === "add" ? argv.indexOf("--") : -1;
    const gateCommand = separator >= 0 ? argv.slice(separator + 1) : [];
    const { args, flags, sections } = argumentsOf(separator >= 0 ? argv.slice(0, separator) : argv);
    const [command, action, ...rest] = args;
    const json = flags.json === true;
    const emit = (value: unknown) => output(json ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2));

    if (command === "version" || flags.version === true) { output("agentctl 0.1.0"); return 0; }
    if (!command || command === "help" || flags.help === true) {
      const topic = command === "help" ? action : command;
      const subcommand = command === "help" ? rest[0] : action;
      if ((topic === "knowledge" || topic === "work") && subcommand === "add") {
        output(recordCreationHelp(topic, flag(flags, "type")));
      } else if (topic === "knowledge" && subcommand === "capture") {
        output(recordCreationHelp("capture"));
      } else {
        output(topic === "knowledge" || topic === "work" ? recordCommandHelp(topic) : help);
      }
      return 0;
    }
    const createsRecord = (command === "work" && action === "add")
      || (command === "knowledge" && (action === "add" || action === "capture"));
    if (sections.length && !createsRecord) {
      throw new Error(`Unknown option: --${sections[0].flag}. Section input is available on record creation commands.`);
    }

    if (command === "init") {
      emit(initProject(fs, action ? resolve(cwd, action) : cwd, templates));
      return 0;
    }

    const root = findProjectRoot(fs, cwd);

    if (command === "doctor") {
      // Validate the manifest, without requiring a separate project identity.
      readYaml(fs, join(root, ".agentctl", "project.yaml"));
      const problems: string[] = [];
      const warnings: string[] = [];
      if (!fs.existsSync(join(root, "AGENTS.md"))) problems.push("Missing AGENTS.md");
      problems.push(...lintDocuments(fs, root).map(formatDiagnostic));
      const checks = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
      const profiles = checks.profiles as Record<string, unknown> | undefined;
      for (const [name, value] of Object.entries(profiles ?? {})) {
        if (!Array.isArray(value) || value.length === 0) warnings.push(`Profile '${name}' is not configured`);
      }
      emit({ ok: problems.length === 0, problems, warnings });
      return problems.length ? 1 : 0;
    }

    if (command === "docs" && action === "lint" && !rest.length) {
      const diagnostics = lintDocuments(fs, root);
      const ok = diagnostics.length === 0;
      emit(json ? { ok, diagnostics } : diagnostics.map(formatDiagnostic).join("\n") || "Documents passed validation.");
      return ok ? 0 : 1;
    }

    if (command === "status") {
      const records = listRecords(fs, root);
      emit({ records: {
        stories: records.filter((r) => r.type === "story").length,
        prds: records.filter((r) => r.type === "prd").length,
        adrs: records.filter((r) => r.type === "adr").length,
        notes: records.filter((r) => r.type === "note").length,
        research: records.filter((r) => r.type === "research").length,
        brainstorms: records.filter((r) => r.type === "brainstorm").length,
      }, activeStories: records.filter((r) => r.type === "story" && ["pending", "ready", "in-progress"].includes(r.status)).length });
      return 0;
    }

    if (command === "task") {
      if (action === "notes" || rest[0] === "notes") {
        const id = action === "notes" ? undefined : action;
        const [operation, ...values] = action === "notes" ? rest : rest.slice(1);
        if (operation === "list" && values.length === 0) {
          const result = listTaskNotes(fs, root, id);
          emit(json ? result : result.notes.map((note) => `${note.id}: ${note.text}`).join("\n") || "No notes.");
          return 0;
        }
        if (operation === "add" && values.length === 1) {
          const note = addTaskNote(fs, root, values[0], id);
          emit(json ? note : `Added ${note.id}: ${note.text}`);
          return 0;
        }
        if (operation === "remove" && values.length === 1) {
          const note = removeTaskNote(fs, root, values[0], id);
          emit(json ? note : `Removed ${note.id}.`);
          return 0;
        }
        throw new Error('Usage: agentctl task [ID] notes add "text" | list | remove N001');
      }
      if (Object.hasOwn(flags, "id")) throw new Error("Use positional task IDs, e.g. 'agentctl task claim STORY-0001'.");
      if (action === "claim") {
        if (rest.length !== 1) throw new Error("Usage: agentctl task claim <ID|next> [--json]");
        const result = claimTask(fs, root, rest[0]);
        if (!result.ok) {
          emit(json ? result : [result.message, ...result.blocked.map((task) => `${task.id}: ${task.reasons.join("; ")}`)].join("\n"));
          return 2;
        }
        emit(json ? result : `Claimed ${result.task.id}: ${result.task.title} (in-progress). Run 'agentctl task getcontext ${result.task.id}' for context.`);
        return 0;
      }
      if (action === "getcontext") {
        if (rest.length > 1) throw new Error("Usage: agentctl task getcontext [ID] [--json]");
        const context = getActiveTaskContext(fs, root, rest[0]);
        emit(json ? context : context.prompt);
        return 0;
      }
      if (action === "complete") {
        if (rest.length > 1) throw new Error("Usage: agentctl task complete [ID] [--json]");
        const completed = completeTask(fs, root, rest[0]);
        emit(json ? { id: completed.id, status: completed.status } : `${completed.id} marked implemented. Verification and acceptance are separate.`);
        return 0;
      }
      throw new Error("Usage: agentctl task claim <ID|next> | task getcontext [ID] | task complete [ID]");
    }

    if ((command === "work" || command === "knowledge")
      && (action === "list" || action === "search" || action === "show" || (command === "work" && action === "blockers"))) {
      emit(readRecordCommand(fs, root, command, action, rest, flags));
      return 0;
    }

    if (command === "work") {
      if (action !== "add") throw new Error("Usage: agentctl work list|search|show|blockers|add");
      if (rest.length) throw new Error("Unexpected argument. See 'agentctl work add -h'.");
      const record = addRecord(fs, root, {
        type: "story", title: requireArg(flag(flags, "title"), "agentctl work add --title TEXT --parent PRD-ID"),
        parent: flag(flags, "parent"),
        dependsOn: idList(flags, "depends-on"), blockedBy: idList(flags, "blocked-by"),
        sections: readSections("story", sections, fs, cwd, options.stdin ?? readStdin),
      });
      emit(json ? record : `Created ${record.id}: ${record.file}`);
      return 0;
    }

    if (command === "knowledge") {
      if (action === "add") {
        if (rest.length) throw new Error("Unexpected argument. See 'agentctl knowledge add -h'.");
        const type = knowledgeAddTypes.find((candidate) => candidate === flag(flags, "type"));
        if (!type) throw new Error(`Use --type ${knowledgeAddTypes.join("|")}.`);
        const usage = `agentctl knowledge add --type ${knowledgeAddTypes.join("|")} --title TEXT`;
        const title = requireArg(flag(flags, "title"), usage);
        const record = addRecord(fs, root, {
          type, title, related: idList(flags, "related"),
          sections: readSections(type, sections, fs, cwd, options.stdin ?? readStdin),
        });
        emit(json ? record : `Created ${record.id}: ${record.file}`);
      } else if (action === "capture") {
        if (rest.length > 1) throw new Error("Unexpected argument. See 'agentctl knowledge capture -h'.");
        const record = addRecord(fs, root, {
          type: "note", title: requireArg(rest[0], "agentctl knowledge capture TEXT --source ID"), source: flag(flags, "source"),
          sections: readSections("note", sections, fs, cwd, options.stdin ?? readStdin),
        });
        emit(json ? record : `Captured ${record.id}: ${record.file}`);
      } else throw new Error("Usage: agentctl knowledge list|search|show|add|capture");
      return 0;
    }

    if (command === "config") {
      if (action === "show") emit(showConfig(fs, root));
      else if (action === "get") emit(getSetting(fs, root, requireArg(rest[0], "agentctl config get models.roles.worker.model")));
      else if (action === "set") {
        const key = requireArg(rest[0], "agentctl config set models.roles.worker.thinking high");
        const value = requireArg(rest[1], "agentctl config set KEY VALUE");
        emit({ key, value: setSetting(fs, root, key, value) });
      } else throw new Error("Usage: agentctl config show|get|set");
      return 0;
    }

    if (command === "verify") {
      if (action === "list") {
        if (rest.length) throw new Error("Usage: agentctl verify list [--json]");
        const gates = listGates(fs, root);
        emit(json ? gates : gates.map((gate) =>
          `${gate.name}: ${gate.command} (${gate.timeoutSeconds}s)`).join("\n") || "No gates registered.");
        return 0;
      }
      if (action === "add") {
        if (rest.length !== 1 || separator < 0 || !gateCommand.length) {
          throw new Error("Usage: agentctl verify add <name> [--timeout N] -- <command> [args...]");
        }
        const rawTimeout = flag(flags, "timeout");
        if (Object.hasOwn(flags, "timeout") && rawTimeout === undefined) {
          throw new Error("Use --timeout with a positive integer in seconds.");
        }
        const timeout = rawTimeout === undefined ? 120 : Number(rawTimeout);
        // Preserve argument boundaries when the shell executes this configured command.
        const quoted = gateCommand.map((word) =>
          /^[a-zA-Z0-9_./:@=+,\\-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`);
        const gate = addGate(fs, root, rest[0], quoted.join(" "), timeout);
        emit(json ? gate : `Added gate ${gate.name}: ${gate.command}`);
        return 0;
      }
      if (rest.length || (action && flag(flags, "profile"))) {
        throw new Error("Usage: agentctl verify [gate] [--json] | --profile NAME | list | add");
      }
      const profile = flag(flags, "profile");
      const result = verify(fs, root, profile ?? action ?? "all", runner, profile ? "profile" : "gate");
      if (json) emit(result);
      else for (const check of result.checks) {
        output(`[${check.passed ? "PASS" : "FAIL"}] ${check.name} (${check.durationMs}ms)`);
        if (check.stdout) output(check.stdout);
        if (check.stderr) output(check.stderr);
      }
      return result.passed ? 0 : 1;
    }

    throw new Error(`Unknown command: ${command}. Try 'agentctl --help'.`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
