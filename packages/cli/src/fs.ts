import * as fs from "node:fs";

/** The small filesystem surface used by agentctl. memfs implements it in tests. */
export interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string, options?: { encoding?: "utf8"; flag?: string }): void;
  mkdirSync(path: string, options?: { recursive: true }): unknown;
  rmdirSync(path: string): void;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
}

export const disk: FileSystem = fs;

/** Replace a tracked text file without exposing a partially written version. */
export function writeFileAtomically(fs: FileSystem, path: string, content: string): void {
  const temporary = `${path}.agentctl.tmp`;
  fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    fs.renameSync(temporary, path);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
