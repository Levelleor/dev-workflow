import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { FileSystem } from "./fs.js";
import { readYaml } from "./project.js";

type Mapping = Record<string, unknown>;
const names = ["project", "models", "checks"] as const;

function parts(key: string): string[] {
  const segments = key.split(".");
  if (segments.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
    throw new Error("Unsafe configuration key.");
  }
  if (segments.length < 2 || segments.some((segment) => !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(segment))) {
    throw new Error("Use a dotted setting path, e.g. models.roles.worker.thinking.");
  }
  if (!names.includes(segments[0] as typeof names[number])) throw new Error("Unknown configuration file.");
  return segments;
}

function lookup(fs: FileSystem, root: string, key: string): { file: string; config: Mapping; path: string[] } {
  const [fileName, ...path] = parts(key);
  const file = join(root, ".agentctl", `${fileName}.yaml`);
  return { file, config: readYaml(fs, file), path };
}

export function getSetting(fs: FileSystem, root: string, key: string): unknown {
  const { config, path } = lookup(fs, root, key);
  let value: unknown = config;
  for (const segment of path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    if (!Object.hasOwn(value, segment)) throw new Error(`Unknown setting: ${key}`);
    value = (value as Mapping)[segment];
  }
  return value;
}

export function setSetting(fs: FileSystem, root: string, key: string, rawValue: string): unknown {
  const { file, config, path } = lookup(fs, root, key);
  if (file.endsWith("checks.yaml")) {
    throw new Error("Verification policy must be changed through a reviewed repository edit.");
  }
  const value: unknown = parseYaml(rawValue);
  if (typeof value === "object" && value !== null) {
    throw new Error("Only scalar setting values may be changed through config set.");
  }
  let parent: Mapping = config;
  for (const segment of path.slice(0, -1)) {
    const next = parent[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    parent = next as Mapping;
  }
  const leaf = path.at(-1)!;
  if (!Object.hasOwn(parent, leaf)) throw new Error(`Unknown setting: ${key}`);
  parent[leaf] = value;
  fs.writeFileSync(file, stringifyYaml(config), { encoding: "utf8" });
  return value;
}

export function showConfig(fs: FileSystem, root: string): Mapping {
  const result: Mapping = {};
  for (const name of names) {
    const file = join(root, ".agentctl", `${name}.yaml`);
    if (fs.existsSync(file)) result[name] = readYaml(fs, file);
  }
  return result;
}
