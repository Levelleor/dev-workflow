import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { FileSystem } from "./fs.js";
import { readYaml } from "./project.js";

export type RunCommand = (command: string, cwd: string, timeoutMs: number) => number;
export type CheckReceipt = { name: string; command: string; passed: boolean };
export type VerifyResult = { profile: string; passed: boolean; checks: CheckReceipt[] };

export const runCommand: RunCommand = (command, cwd, timeoutMs) => {
  const child = spawnSync(command, { cwd, timeout: timeoutMs, shell: true, stdio: "inherit" });
  return child.status ?? 1;
};

export function verify(
  fs: FileSystem, root: string, profile: string, runner: RunCommand = runCommand,
): VerifyResult {
  const policy = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
  const profiles = policy.profiles as Record<string, unknown> | undefined;
  const checks = policy.checks as Record<string, unknown> | undefined;
  const selected = profiles?.[profile];
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error(`Verification profile '${profile}' is missing or empty. No checks were run.`);
  }
  const receipts: CheckReceipt[] = [];
  for (const name of selected) {
    if (typeof name !== "string") throw new Error("Invalid verification check name.");
    const spec = checks?.[name] as Record<string, unknown> | undefined;
    if (!spec || typeof spec.command !== "string" || !spec.command.trim()) {
      throw new Error(`Verification check '${name}' is not configured.`);
    }
    const timeout = typeof spec.timeoutSeconds === "number" && spec.timeoutSeconds > 0
      ? spec.timeoutSeconds * 1000 : 120000;
    const passed = runner(spec.command, root, timeout) === 0;
    receipts.push({ name, command: spec.command, passed });
    if (!passed) break;
  }
  return { profile, passed: receipts.length === selected.length && receipts.every((r) => r.passed), checks: receipts };
}
