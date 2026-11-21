import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystem } from "./fs.js";
import { disk } from "./fs.js";
import { findProjectRoot, initProject, readYaml } from "./project.js";
import { addRecord, findRecord, listRecords, type RecordType } from "./records.js";
import { getSetting, setSetting, showConfig } from "./config.js";
import { runCommand, verify, type RunCommand } from "./verify.js";
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
  agentctl task claim <ID|next> [--json]            Claim a specific or next eligible task, with context
  Example: agentctl task claim next                  Select automatically by priority
  agentctl task getcontext [ID] [--json]            Resume an in-progress task
  agentctl task complete [ID] [--json]              Mark an in-progress task implemented
  agentctl work list|show ID|add --title T --parent PRD-ID
  agentctl knowledge list [--type prd|adr|note]
  agentctl knowledge show ID
  agentctl knowledge add --type prd|adr --title TEXT
  agentctl knowledge capture TEXT --source ID
  agentctl config show|get KEY|set KEY VALUE
  agentctl verify [--profile NAME]
  agentctl help | --help | --version

Task lifecycle: pending/ready -> in-progress -> implemented (not verified).
Task IDs use stable STORY-0001 format and are positional across task commands.
'next' uses priority 1..5 (1 highest, default 3), then stable ID.
Claiming an explicit ID bypasses priority but still checks dependencies and ownership.
Dependencies must be implemented/completed/accepted; proposed tasks cannot be claimed.
Only one in-progress task per working tree. Unavailable claims explain why (exit 2).
--json outputs structured context or diagnostics for calling agents.
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
    const { args, flags } = argumentsOf(argv);
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
      if (Object.hasOwn(flags, "id")) throw new Error("Use positional task IDs, e.g. 'agentctl task claim STORY-0001'.");
      if (action === "claim") {
        if (rest.length !== 1) throw new Error("Usage: agentctl task claim <ID|next> [--json]");
        const result = claimTask(fs, root, rest[0]);
        if (!result.ok) {
          emit(json ? result : [result.message, ...result.blocked.map((task) => `${task.id}: ${task.reasons.join("; ")}`)].join("\n"));
          return 2;
        }
        emit(json ? result : result.context.prompt);
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
      else if (action === "get") emit(getSetting(fs, root, requireArg(rest[0], "agentctl config get models.roles.worker.model")));
      else if (action === "set") {
        const key = requireArg(rest[0], "agentctl config set models.roles.worker.thinking high");
        const value = requireArg(rest[1], "agentctl config set KEY VALUE");
        emit({ key, value: setSetting(fs, root, key, value) });
      } else throw new Error("Usage: agentctl config show|get|set");
      return 0;
    }

    if (command === "verify") {
      const result = verify(fs, root, flag(flags, "profile") ?? "scaffold", runner);
      emit(result);
      return result.passed ? 0 : 1;
    }

    throw new Error(`Unknown command: ${command}. Try 'agentctl --help'.`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
