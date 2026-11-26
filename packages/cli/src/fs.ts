import * as fs from "node:fs";
import { join } from "node:path";

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
  lstatSync(path: string): { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean };
  realpathSync(path: string): string;
}

export const disk: FileSystem = fs;

export function withRecordLock<T>(fs: FileSystem, root: string, action: () => T): T {
  const directory = join(root, ".agentctl", "runtime");
  const lock = join(directory, "task.lock");
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error("Task operation is locked by another process. Only one local coordinator may write records at a time.");
  }
  try {
    return action();
  } finally {
    fs.rmdirSync(lock);
  }
}

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
