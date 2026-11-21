import * as fs from "node:fs";

/** The small filesystem surface used by agentctl. memfs implements it in tests. */
export interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string, options?: { encoding?: "utf8"; flag?: string }): void;
  mkdirSync(path: string, options?: { recursive: true }): unknown;
  rmdirSync(path: string): void;
  readdirSync(path: string): string[];
}

export const disk: FileSystem = fs;
