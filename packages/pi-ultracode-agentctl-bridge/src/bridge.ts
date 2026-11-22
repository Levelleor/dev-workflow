/**
 * Pi extension for Ultracode host capabilities.
 * This never exposes a generic process runner: every operation is mapped to a
 * validated, fixed agentctl argv and executed using execFile (shell: false).
 *
 * hostCall write operations must be journalled by pi-ultracode itself.
 */
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../../cli/dist/index.js");
const TASK = /^STORY-\d{4,}$/;
const NOTE = /^N\d{3,}$/;
const GATE = /^[a-z][a-z0-9-]*$/;
const MAX_OUTPUT = 1024 * 1024;

export type CapabilityContext = { cwd: string; signal: AbortSignal };
export type RunResult = { exitCode: number; value: unknown };
export type Executor = (
  args: readonly string[], cwd: string, signal: AbortSignal, timeoutMs: number,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
export type CapabilityDefinition = {
  name: string;
  version: string;
  effect: "read" | "write";
  timeoutMs: number;
  inputSchema: unknown;
  execute(input: unknown, context: CapabilityContext): Promise<RunResult>;
};

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A capability input must be a JSON object.");
  }
  return input as Record<string, unknown>;
}
function shape(input: unknown, fields: string[]): Record<string, unknown> {
  const value = object(input);
  if (Object.keys(value).some((key) => !fields.includes(key))) {
    throw new Error("Unsupported agentctl capability input field.");
  }
  return value;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !TASK.test(value)) throw new Error("Invalid story ID.");
  return value;
}
function optionalId(value: unknown): string[] {
  return value === undefined ? [] : [id(value)];
}
function operation(value: unknown, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error("Operation is not permitted by the agentctl bridge.");
  }
  return value;
}
function note(value: unknown): string {
  if (typeof value !== "string" || !NOTE.test(value)) throw new Error("Invalid note ID.");
  return value;
}
function noteText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) {
    throw new Error("Invalid note text.");
  }
  return value;
}
function gate(value: unknown): string {
  if (typeof value !== "string" || !GATE.test(value) || value.length > 100) {
    throw new Error("Invalid gate name.");
  }
  return value;
}

/** Fixed commands only. No caller-controlled flags, executable or shell. */
export function allowedArguments(kind: "read" | "write" | "verify", input: unknown): string[] {
  if (kind === "verify") {
    const data = shape(input, ["gate"]);
    return ["verify", ...(data.gate === undefined ? [] : [gate(data.gate)]), "--json"];
  }
  const data = shape(input, kind === "read" ? ["op", "id"] : ["op", "id", "text", "noteId"]);
  const op = operation(data.op,
    kind === "read" ? ["list", "context", "snapshot", "gates", "notes"] :
      ["claim", "complete", "note-add", "note-remove"]);
  if (kind === "read") {
    if (op === "list") return ["work", "list", "--json"];
    if (op === "snapshot") return ["task", "snapshot", ...optionalId(data.id), "--json"];
    if (op === "gates") return ["verify", "list", "--json"];
    if (op === "context") return ["task", "getcontext", ...optionalId(data.id), "--json"];
    return ["task", ...optionalId(data.id), "notes", "list", "--json"];
  }
  if (op === "claim") {
    return ["task", "claim", data.id === undefined || data.id === "next" ? "next" : id(data.id), "--json"];
  }
  if (op === "complete") return ["task", "complete", id(data.id), "--json"];
  if (op === "note-add") {
    return ["task", ...optionalId(data.id), "notes", "add", noteText(data.text), "--json"];
  }
  return ["task", ...optionalId(data.id), "notes", "remove", note(data.noteId), "--json"];
}

export const execAgentctl: Executor = (args, cwd, signal, timeoutMs) => new Promise((done, fail) => {
  execFile(process.execPath, [CLI, ...args], {
    cwd, signal, timeout: timeoutMs, shell: false, windowsHide: true,
    maxBuffer: MAX_OUTPUT, encoding: "utf8",
  }, (error, stdout, stderr) => {
    const code: unknown = error ? error.code : 0;
    if (error && typeof code !== "number") {
      fail(new Error("agentctl execution failed: " + error.message));
      return;
    }
    const exitCode = typeof code === "number" ? code : 0;
    done({ exitCode, stdout, stderr });
  });
});

const READ_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["list", "context", "snapshot", "gates", "notes"] },
    id: { type: "string" },
  },
  required: ["op"],
  additionalProperties: false,
};
const WRITE_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["claim", "complete", "note-add", "note-remove"] },
    id: { type: "string" },
    text: { type: "string" },
    noteId: { type: "string" },
  },
  required: ["op"],
  additionalProperties: false,
};
const VERIFY_SCHEMA = {
  type: "object",
  properties: { gate: { type: "string" } },
  additionalProperties: false,
};

export function createAgentctlCapabilities(executor: Executor = execAgentctl): CapabilityDefinition[] {
  function capability(
    name: string, effect: "read" | "write", schema: unknown, timeoutMs: number,
    kind: "read" | "write" | "verify",
  ): CapabilityDefinition {
    return {
      name, version: kind === "read" ? "2" : "1", effect, timeoutMs, inputSchema: schema,
      async execute(input, context) {
        const argv = allowedArguments(kind, input);
        // This cwd is supplied by Ultracode for a trusted project, never by the workflow.
        const cwd = realpathSync(context.cwd);
        const result = await executor(argv, cwd, context.signal, timeoutMs);
        if (!Number.isInteger(result.exitCode) || Math.abs(result.exitCode) > 255) {
          throw new Error("Invalid agentctl process exit status.");
        }
        if (result.stdout.length > MAX_OUTPUT || result.stderr.length > MAX_OUTPUT) {
          throw new Error("agentctl output exceeded its limit.");
        }
        let value: unknown;
        try { value = JSON.parse(result.stdout); }
        catch { throw new Error("agentctl did not return valid JSON: " + result.stderr.slice(-500)); }
        // A failed verification gate is valid data. Other unexpected failures stop the workflow.
        if (result.exitCode !== 0 &&
            !(kind === "verify" && result.exitCode === 1) &&
            !(kind === "write" && argv[1] === "claim" && result.exitCode === 2)) {
          throw new Error("agentctl command failed: " + result.stderr.slice(-1000));
        }
        return { exitCode: result.exitCode, value };
      },
    };
  }
  return [
    capability("agentctl.read", "read", READ_SCHEMA, 30_000, "read"),
    capability("agentctl.write", "write", WRITE_SCHEMA, 30_000, "write"),
    // Verification executes project-defined commands and therefore counts as a write effect.
    capability("agentctl.verify", "write", VERIFY_SCHEMA, 600_000, "verify"),
  ];
}

export interface PiHostEvents {
  events: { on(name: string, handler: (collector: { register(value: CapabilityDefinition): void }) => void): void };
}

/** Load this extension alongside Ultracode; registration is synchronous. */
export default function ultracodeAgentctlBridge(pi: PiHostEvents): void {
  pi.events.on("ultracode:host-capabilities:collect", (collector) => {
    for (const capability of createAgentctlCapabilities()) collector.register(capability);
  });
}
