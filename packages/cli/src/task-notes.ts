import { formatDiagnostic } from "./document-links.js";
import { lintDocumentBody } from "./documents.js";
import { readFrontmatter } from "./frontmatter.js";
import type { FileSystem } from "./fs.js";
import { withRecordLock, writeFileAtomically } from "./fs.js";
import { fragmentHasBoundary } from "./markdown.js";
import { hasReservedNoteHeading, parseNotes, type TaskNote } from "./note-sections.js";
import { listRecords, type RecordEntry } from "./records.js";

export type { TaskNote } from "./note-sections.js";
export type TaskNotes = { taskId: string; notes: TaskNote[] };

function taskRecord(fs: FileSystem, root: string, id?: string): RecordEntry {
  const tasks = listRecords(fs, root, "story");
  if (id) {
    const matches = tasks.filter((task) => task.id === id);
    if (!matches.length) throw new Error(`Unknown task: ${id}`);
    if (matches.length > 1) throw new Error(`Duplicate task ID: ${id}`);
    return matches[0];
  }
  const active = tasks.filter((task) => task.status === "in-progress");
  if (active.length !== 1) {
    throw new Error(active.length
      ? "Multiple tasks in progress; specify a task ID."
      : "No task in progress; specify a task ID or claim one first.");
  }
  return active[0];
}

function render(section: ReturnType<typeof parseNotes>, notes: TaskNote[]): string {
  const before = section.before.trimEnd();
  const after = section.after.trimStart();
  const block = notes.length
    ? "## Notes\n\n" + notes.map((note) => `### ${note.id}\n${note.text}`).join("\n\n")
    : "";
  return [before, block, after].filter(Boolean).join("\n\n") + "\n";
}

/** Note IDs are derived from surviving headings, without a stored counter. */
function nextNoteId(notes: TaskNote[]): string {
  let lastNumber = 0;
  for (const note of notes) {
    const number = Number(note.id.slice(1));
    if (!Number.isSafeInteger(number)) throw new Error(`Invalid task note ID: ${note.id}`);
    lastNumber = Math.max(lastNumber, number);
  }
  if (lastNumber === Number.MAX_SAFE_INTEGER) throw new Error("Task note IDs exhausted.");
  return `N${String(lastNumber + 1).padStart(3, "0")}`;
}

function writeNotes(fs: FileSystem, root: string, task: RecordEntry, body: string, removeLegacyCounter: boolean): void {
  const raw = fs.readFileSync(task.file, "utf8");
  const front = readFrontmatter(raw);
  if (!front) throw new Error("Task is missing YAML frontmatter.");
  let header = raw.slice(0, front.bodyStart);
  // Drop obsolete counter metadata on add, preserving other YAML content.
  if (removeLegacyCounter) {
    const updated = raw.slice(front.start, front.end).replace(/^note_sequence:[^\r\n]*\r?\n/gm, "");
    header = raw.slice(0, front.start) + updated + raw.slice(front.end, front.bodyStart);
  }
  const next = header + body;
  const issues = lintDocumentBody(fs, root, task.file, next);
  if (issues.length) throw new Error(issues.map(formatDiagnostic).join("\n"));
  writeFileAtomically(fs, task.file, next);
}

export function listTaskNotes(fs: FileSystem, root: string, id?: string): TaskNotes {
  const task = taskRecord(fs, root, id);
  return { taskId: task.id, notes: parseNotes(task.body).notes };
}

export function addTaskNote(fs: FileSystem, root: string, text: string, id?: string): TaskNote {
  const body = text.trim();
  if (!body || body.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) {
    throw new Error("Note must contain 1 to 4000 readable characters.");
  }
  if (hasReservedNoteHeading(body)) {
    throw new Error("Notes cannot contain Markdown section or note-ID headings.");
  }
  if (!fragmentHasBoundary(body)) throw new Error("Close the Markdown block in the note.");
  return withRecordLock(fs, root, () => {
    const task = taskRecord(fs, root, id);
    const parsed = parseNotes(task.body);
    const note = { id: nextNoteId(parsed.notes), text: body };
    writeNotes(fs, root, task, render(parsed, [...parsed.notes, note]), true);
    return note;
  });
}

export function removeTaskNote(fs: FileSystem, root: string, noteId: string, id?: string): TaskNote {
  if (!/^N\d{3,}$/.test(noteId)) throw new Error("Note ID must look like N001.");
  return withRecordLock(fs, root, () => {
    const task = taskRecord(fs, root, id);
    const parsed = parseNotes(task.body);
    const note = parsed.notes.find((item) => item.id === noteId);
    if (!note) throw new Error(`Unknown note ${noteId} in task ${task.id}.`);
    writeNotes(fs, root, task, render(parsed, parsed.notes.filter((item) => item.id !== noteId)), false);
    return note;
  });
}
