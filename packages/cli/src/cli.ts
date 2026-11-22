import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystem } from "./fs.js";
import { disk } from "./fs.js";
import { findProjectRoot, initProject, readYaml } from "./project.js";
import { addRecord, findRecord, listRecords, type RecordType } from "./records.js";
import { getSetting, setSetting, showConfig } from "./config.js";
import { addGate, listGates, runCommand, verify, type RunCommand } from "./verify.js";
import { addTaskNote, listTaskNotes, removeTaskNote } from "./task-notes.js";
import { claimTask, completeTask, getActiveTaskContext } from "./task.js";

export type CliOptions = {
  cwd?: string;
  fs?: FileSystem;
  templates?: string;
  runner?: RunCommand;
  output?: (message: string) => void;
  error?: (message: string) => void;
};

const help = `agentctl: repository-backed coding-agent development workflow

Usage:
  agentctl init [directory]                         Safely install project files
  agentctl doctor                                   Inspect project setup
  agentctl status [--json]                          Show project and task counts
  agentctl task claim <ID|next> [--json]            Claim a task, returning its ID and status
  Example: agentctl task claim next                  Select automatically by priority
  agentctl task getcontext [ID] [--json]            Resume an in-progress task
  agentctl task snapshot [ID] [--json]              Return task context and verification gates
  agentctl task complete [ID] [--json]              Mark an in-progress task implemented
  agentctl task notes add "text" [--json]            Add a note to the current task
  agentctl task notes list [--json]                  List notes on the current task
  agentctl task notes remove N001                    Remove a task note
  agentctl task STORY-0001 notes add|list|remove     Address a task by stable ID
  agentctl work list|show ID|add --title T --parent PRD-ID
  agentctl knowledge list [--type prd|adr|note]
  agentctl knowledge show ID
  agentctl knowledge add --type prd|adr --title TEXT
  agentctl knowledge capture TEXT --source ID
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
function argumentsOf(argv: string[]): { args: string[]; flags: Record<string, Flag> } {
  const args: string[] = [];
  const flags: Record<string, Flag> = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--") || token === "--") {
      args.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split("=", 2);
    if (!/^[a-z][\w-]*$/.test(name)) throw new Error(`Invalid option: ${token}`);
    if (inline !== undefined) flags[name] = inline;
    else if (["json", "help", "version"].includes(name)) flags[name] = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) flags[name] = argv[++i];
    else flags[name] = true;
  }
  return { args, flags };
}

function flag(flags: Record<string, Flag>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Missing argument. Usage: ${usage}`);
  return value;
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
    const { args, flags } = argumentsOf(separator >= 0 ? argv.slice(0, separator) : argv);
    const [command, action, ...rest] = args;
    const json = flags.json === true;
    const emit = (value: unknown) => output(json ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2));

    if (command === "version" || flags.version === true) { output("agentctl 0.1.0"); return 0; }
    if (!command || command === "help" || flags.help === true) { output(help); return 0; }

    if (command === "init") {
      emit(initProject(fs, action ? resolve(cwd, action) : cwd, templates));
      return 0;
    }

    const root = findProjectRoot(fs, cwd);

    if (command === "doctor") {
      const project = readYaml(fs, join(root, ".agentctl", "project.yaml"));
      const problems: string[] = [];
      const warnings: string[] = [];
      if (!fs.existsSync(join(root, "AGENTS.md"))) problems.push("Missing AGENTS.md");
      const checks = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
      const profiles = checks.profiles as Record<string, unknown> | undefined;
      for (const [name, value] of Object.entries(profiles ?? {})) {
        if (!Array.isArray(value) || value.length === 0) warnings.push(`Profile '${name}' is not configured`);
      }
      emit({ ok: problems.length === 0, project: project.project, problems, warnings });
      return problems.length ? 1 : 0;
    }

    if (command === "status") {
      const project = readYaml(fs, join(root, ".agentctl", "project.yaml"));
      const records = listRecords(fs, root);
      emit({ project: project.project, orchestration: project.orchestration, records: {
        stories: records.filter((r) => r.type === "story").length,
        prds: records.filter((r) => r.type === "prd").length,
        adrs: records.filter((r) => r.type === "adr").length,
        notes: records.filter((r) => r.type === "note").length,
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
      if (action === "snapshot") {
        if (rest.length > 1) throw new Error("Usage: agentctl task snapshot [ID] [--json]");
        const context = getActiveTaskContext(fs, root, rest[0]);
        const gates = listGates(fs, root);
        emit({ context, gates });
        return 0;
      }
      if (action === "complete") {
        if (rest.length > 1) throw new Error("Usage: agentctl task complete [ID] [--json]");
        const completed = completeTask(fs, root, rest[0]);
        emit(json ? { id: completed.id, status: completed.status } : `${completed.id} marked implemented. Verification and acceptance are separate.`);
        return 0;
      }
      throw new Error("Usage: agentctl task claim <ID|next> | task getcontext [ID] | task snapshot [ID] | task complete [ID]");
    }

    if (command === "work") {
      if (action === "list") {
        const records = listRecords(fs, root, "story");
        emit(json ? records.map(({ id, title, status, metadata }) => ({ id, title, status, parent: metadata.parent })) : records.map((r) => `${r.id} [${r.status}] ${r.title}`).join("\n") || "No stories.");
      } else if (action === "show") {
        const record = findRecord(fs, root, requireArg(rest[0], "agentctl work show ID"));
        if (record.type !== "story") throw new Error(`Not a story: ${record.id}`);
        emit(json ? record : fs.readFileSync(record.file, "utf8"));
      } else if (action === "add") {
        const record = addRecord(fs, root, { type: "story", title: requireArg(flag(flags, "title"), "agentctl work add --title TEXT --parent PRD-ID"), parent: flag(flags, "parent") });
        emit(json ? record : `Created ${record.id}: ${record.file}`);
      } else throw new Error("Usage: agentctl work list|show|add");
      return 0;
    }

    if (command === "knowledge") {
      if (action === "list") {
        const type = flag(flags, "type");
        if (type && !["prd", "adr", "note"].includes(type)) throw new Error("Invalid knowledge record type.");
        const records = listRecords(fs, root, type as RecordType | undefined).filter((r) => r.type !== "story");
        emit(json ? records.map(({ id, title, type, status }) => ({ id, title, type, status })) : records.map((r) => `${r.id} [${r.status}] ${r.title}`).join("\n") || "No knowledge records.");
      } else if (action === "show") {
        const record = findRecord(fs, root, requireArg(rest[0], "agentctl knowledge show ID"));
        emit(json ? record : fs.readFileSync(record.file, "utf8"));
      } else if (action === "add") {
        const type = flag(flags, "type");
        if (type !== "prd" && type !== "adr") throw new Error("Use --type prd or --type adr.");
        const record = addRecord(fs, root, { type, title: requireArg(flag(flags, "title"), "agentctl knowledge add --type prd|adr --title TEXT") });
        emit(json ? record : `Created ${record.id}: ${record.file}`);
      } else if (action === "capture") {
        const record = addRecord(fs, root, { type: "note", title: requireArg(rest[0], "agentctl knowledge capture TEXT --source ID"), source: flag(flags, "source") });
        emit(json ? record : `Captured ${record.id}: ${record.file}`);
      } else throw new Error("Usage: agentctl knowledge list|show|add|capture");
      return 0;
    }

    if (command === "config") {
      if (action === "show") emit(showConfig(fs, root));
      else if (action === "get") emit(getSetting(fs, root, requireArg(rest[0], "agentctl config get project.project.id")));
      else if (action === "set") {
        const key = requireArg(rest[0], "agentctl config set project.orchestration.mode sequential");
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
