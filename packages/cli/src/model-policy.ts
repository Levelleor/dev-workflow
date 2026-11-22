import { join } from "node:path";
import type { FileSystem } from "./fs.js";
import { readYaml } from "./project.js";

/** Model selection is resolved by Ultracode/Pi. This validates only the policy's shape. */
export type AgentRole = { model?: string; thinking?: string };
export type WorkflowModels = {
  roles: Record<string, AgentRole>;
  repairRetries: number;
  reviewRetries: number;
};
const MAX_RETRIES = 10;

export function loadWorkflowModels(fs: FileSystem, root: string): WorkflowModels {
  const config = readYaml(fs, join(root, ".agentctl", "models.yaml"));
  if (config.roles === undefined || config.roles === null ||
      typeof config.roles !== "object" || Array.isArray(config.roles)) {
    throw new Error("models.roles must be a mapping of agent roles.");
  }
  const roles: Record<string, AgentRole> = {};
  for (const [name, value] of Object.entries(config.roles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !value ||
        typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid model role: ${name}`);
    }
    const spec = value as Record<string, unknown>;
    if (Object.keys(spec).some((key) => key !== "model" && key !== "thinking") ||
        (spec.model !== undefined && (typeof spec.model !== "string" || !spec.model.trim() || spec.model.length > 256)) ||
        (spec.thinking !== undefined && (typeof spec.thinking !== "string" ||
          !/^[a-z][a-z0-9-]*$/.test(spec.thinking) || spec.thinking.length > 32))) {
      throw new Error(`Invalid model/thinking configuration for role '${name}'.`);
    }
    roles[name] = {
      ...(spec.model === undefined ? {} : { model: spec.model as string }),
      ...(spec.thinking === undefined ? {} : { thinking: spec.thinking as string }),
    };
  }
  const retries = (key: "repairRetries" | "reviewRetries"): number => {
    const value = config[key] ?? 2;
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_RETRIES) {
      throw new Error(`models.${key} must be an integer between 0 and ${MAX_RETRIES}.`);
    }
    return value as number;
  };
  return { roles, repairRetries: retries("repairRetries"), reviewRetries: retries("reviewRetries") };
}
