import type { FileSystem } from "./fs.js";
import { writeFileAtomically } from "./fs.js";
import { listRecords, type RecordEntry } from "./records.js";
import { withTaskLock } from "./task.js";

export type TaskNote = { id: string; text: string };
export type TaskNotes = { taskId: string; notes: TaskNote[] };

type NoteSection = { before: string; after: string; notes: TaskNote[] };

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

/** Notes are simple Markdown subsections, leaving all other task content intact. */
function parseNotes(raw: string): NoteSection {
  const headings = [...raw.matchAll(/^## Notes[ \t]*$/gm)];
  if (headings.length > 1) throw new Error("Task contains multiple Notes sections.");
  if (!headings.length) return { before: raw, after: "", notes: [] };
  const start = headings[0].index;
  const remaining = raw.slice(start + headings[0][0].length);
  const nextHeading = /^## [^\r\n]+$/m.exec(remaining);
  const end = nextHeading ? start + headings[0][0].length + nextHeading.index : raw.length;
  const content = raw.slice(start + headings[0][0].length, end);
  const matches = [...content.matchAll(/^### (N\d{3,})[ \t]*$/gm)];
  if (!matches.length && content.trim()) throw new Error("Malformed task notes section.");
  if (matches.length && content.slice(0, matches[0].index).trim()) {
    throw new Error("Malformed text before the first task note.");
  }
  const ids = new Set<string>();
  const notes = matches.map((match, index) => {
    const id = match[1];
    if (ids.has(id)) throw new Error(`Duplicate task note: ${id}`);
    ids.add(id);
    const text = content.slice(
      match.index + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : content.length,
    ).trim();
    if (!text) throw new Error(`Empty task note: ${id}`);
    return { id, text };
  });
  return { before: raw.slice(0, start), after: raw.slice(end), notes };
}

function render(section: NoteSection, notes: TaskNote[]): string {
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

/** Drop obsolete counter metadata when a task is next updated. */
function withoutLegacyNoteSequence(raw: string): string {
  const frontmatter = /^---(\r?\n)([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!frontmatter) throw new Error("Task is missing YAML frontmatter.");
  const front = frontmatter[2];
  const updated = front.split(/\r?\n/).filter((line) => !/^note_sequence:[^\r\n]*$/.test(line))
    .join(frontmatter[1]);
  const offset = 3 + frontmatter[1].length;
  return raw.slice(0, offset) + updated + raw.slice(offset + front.length);
}

export function listTaskNotes(fs: FileSystem, root: string, id?: string): TaskNotes {
  const task = taskRecord(fs, root, id);
  return { taskId: task.id, notes: parseNotes(fs.readFileSync(task.file, "utf8")).notes };
}

export function addTaskNote(fs: FileSystem, root: string, text: string, id?: string): TaskNote {
  const body = text.trim();
  if (!body || body.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) {
    throw new Error("Note must contain 1 to 4000 readable characters.");
  }
  if (/^## |^### N\d{3,}[ \t]*$/m.test(body)) {
    throw new Error("Notes cannot contain Markdown section or note-ID headings.");
  }
  return withTaskLock(fs, root, () => {
    const task = taskRecord(fs, root, id);
    const raw = fs.readFileSync(task.file, "utf8");
    const parsed = parseNotes(raw);
    const note = { id: nextNoteId(parsed.notes), text: body };
    writeFileAtomically(fs, task.file,
      render(parseNotes(withoutLegacyNoteSequence(raw)), [...parsed.notes, note]));
    return note;
  });
}

export function removeTaskNote(fs: FileSystem, root: string, noteId: string, id?: string): TaskNote {
  if (!/^N\d{3,}$/.test(noteId)) throw new Error("Note ID must look like N001.");
  return withTaskLock(fs, root, () => {
    const task = taskRecord(fs, root, id);
    const parsed = parseNotes(fs.readFileSync(task.file, "utf8"));
    const note = parsed.notes.find((item) => item.id === noteId);
    if (!note) throw new Error(`Unknown note ${noteId} in task ${task.id}.`);
    writeFileAtomically(fs, task.file, render(parsed, parsed.notes.filter((item) => item.id !== noteId)));
    return note;
  });
}
