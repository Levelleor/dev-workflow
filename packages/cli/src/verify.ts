import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { isMap, parseDocument } from "yaml";
import type { FileSystem } from "./fs.js";
import { withRecordLock, writeFileAtomically } from "./fs.js";
import { readYaml } from "./project.js";

export type Gate = { name: string; command: string; timeoutSeconds: number };
export type CommandOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
};
export type RunCommand = (command: string, cwd: string, timeoutMs: number) => CommandOutcome;
export type CheckReceipt = Gate & CommandOutcome & { passed: boolean };
export type VerifyResult = { selection: string; passed: boolean; checks: CheckReceipt[] };

const MAX_OUTPUT = 8000;
const MAX_BUFFER = 1024 * 1024;
const gateName = /^[a-z][a-z0-9-]*$/;

export const runCommand: RunCommand = (command, cwd, timeoutMs) => {
  const start = performance.now();
  const child = spawnSync(command, {
    cwd, timeout: timeoutMs, shell: true, encoding: "utf8",
    stdio: "pipe", maxBuffer: MAX_BUFFER,
  });
  const stderr = (child.stderr ?? "") + (child.error ? `\n${child.error.message}` : "");
  return {
    exitCode: child.error ? null : child.status,
    stdout: (child.stdout ?? "").slice(-MAX_OUTPUT),
    stderr: stderr.slice(-MAX_OUTPUT),
    durationMs: Math.round(performance.now() - start),
    timedOut: (child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
  };
};

function namedGates(fs: FileSystem, root: string): Map<string, Gate> {
  const config = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
  const policy = config.policy;
  if (policy !== undefined && (!policy || typeof policy !== "object" || Array.isArray(policy))) {
    throw new Error("Verification policy must be a YAML mapping.");
  }
  if (policy && Object.hasOwn(policy, "unconfiguredProfile") &&
      (policy as Record<string, unknown>).unconfiguredProfile !== "block") {
    throw new Error("policy.unconfiguredProfile must be 'block'.");
  }
  const values = config.checks;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Verification checks must be a YAML mapping.");
  }
  const result = new Map<string, Gate>();
  for (const [name, value] of Object.entries(values)) {
    if (!gateName.test(name) || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid verification gate: ${name}`);
    }
    const spec = value as Record<string, unknown>;
    if (typeof spec.command !== "string" || !spec.command.trim()) {
      throw new Error(`Verification gate '${name}' has no command.`);
    }
    const timeoutSeconds = spec.timeoutSeconds ?? 120;
    if (typeof timeoutSeconds !== "number" || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1) {
      throw new Error(`Invalid timeout for gate '${name}'.`);
    }
    // All registered gates are mandatory. Reject the removed flag rather than
    // silently interpreting an obsolete "required: false" as optional.
    if (Object.hasOwn(spec, "required")) {
      throw new Error(`Gate '${name}' uses the removed 'required' setting; all gates are mandatory.`);
    }
    result.set(name, { name, command: spec.command, timeoutSeconds });
  }
  return result;
}

export function listGates(fs: FileSystem, root: string): Gate[] {
  return [...namedGates(fs, root).values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Create an additional gate without changing or removing existing verification policy. */
export function addGate(
  fs: FileSystem, root: string, name: string, command: string, timeoutSeconds = 120,
): Gate {
  return withRecordLock(fs, root, () => {
    if (!gateName.test(name) || ["list", "add", "all"].includes(name)) {
      throw new Error("Gate names must begin with a letter and contain only lowercase letters, digits and hyphens.");
    }
    if (!command.trim()) throw new Error("A verification command is required.");
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1) {
      throw new Error("Gate timeout must be a positive integer in seconds.");
    }
    if (namedGates(fs, root).has(name)) throw new Error(`Gate '${name}' already exists; existing gates cannot be overwritten.`);

    const file = join(root, ".agentctl", "checks.yaml");
    const document = parseDocument(fs.readFileSync(file, "utf8"));
    if (document.errors.length || !isMap(document.get("checks", true))) {
      throw new Error("Cannot update invalid verification configuration.");
    }
    document.setIn(["checks", name], { command, timeoutSeconds });
    writeFileAtomically(fs, file, document.toString());
    return { name, command, timeoutSeconds };
  });
}

export function verify(
  fs: FileSystem, root: string, target = "all",
  runner: RunCommand = runCommand, mode: "gate" | "profile" = "gate",
): VerifyResult {
  const gates = namedGates(fs, root);
  let names: string[];
  if (mode === "profile") {
    const config = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
    const policy = config.policy;
    if (policy !== undefined &&
        (!policy || typeof policy !== "object" || Array.isArray(policy))) {
      throw new Error("Verification policy must be a YAML mapping.");
    }
    // Missing policies retain the historical fail-closed behaviour.
    // Only "block" is supported: no configuration may silently pass zero gates.
    const onUnconfigured = policy && Object.hasOwn(policy, "unconfiguredProfile")
      ? (policy as Record<string, unknown>).unconfiguredProfile : "block";
    if (onUnconfigured !== "block") {
      throw new Error("policy.unconfiguredProfile must be 'block'.");
    }
    const profiles = config.profiles as Record<string, unknown> | undefined;
    const selected = profiles?.[target];
    if (!Array.isArray(selected) || selected.length === 0) {
      throw new Error(`Verification profile '${target}' is missing or empty. No checks were run (policy.unconfiguredProfile: block).`);
    }
    if (selected.some((name) => typeof name !== "string")) {
      throw new Error(`Invalid verification profile '${target}'.`);
    }
    names = selected as string[];
  } else if (target === "all") {
    names = [...gates.keys()].sort();
    if (!names.length) throw new Error("No verification gates registered. Use 'agentctl verify add'.");
  } else {
    names = [target];
  }
  for (const name of names) {
    if (!gates.has(name)) throw new Error(`Verification gate '${name}' is not registered.`);
  }
  return runGates(root, names.map((name) => gates.get(name)!), runner,
    mode === "profile" ? `profile:${target}` : target);
}

/** Execute the exact gate definitions selected by the caller, without reloading mutable configuration. */
export function runGates(
  root: string, gates: readonly Gate[], runner: RunCommand = runCommand, selection = "all",
): VerifyResult {
  if (!gates.length) throw new Error("No verification gates registered. Use 'agentctl verify add'.");
  const receipts: CheckReceipt[] = [];
  for (const gate of gates) {
    const outcome = runner(gate.command, root, gate.timeoutSeconds * 1000);
    receipts.push({ ...gate, ...outcome, passed: outcome.exitCode === 0 && !outcome.timedOut });
  }
  return { selection, passed: receipts.every((receipt) => receipt.passed), checks: receipts };
}
