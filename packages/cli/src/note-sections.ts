import type { Heading, Root } from "mdast";
import { parseMarkdown } from "./markdown.js";

export type TaskNote = { id: string; text: string };
type NoteSection = { before: string; after: string; notes: TaskNote[] };

export class NoteFormatError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
  }
}

type LocatedHeading = Heading & { position: NonNullable<Heading["position"]> };

function headings(tree: Root): LocatedHeading[] {
  return tree.children.filter((node): node is LocatedHeading => node.type === "heading" && !!node.position);
}

function headingSource(raw: string, heading: LocatedHeading): string {
  return raw.slice(heading.position.start.offset, heading.position.end.offset);
}

export function parseNotes(body: string, tree = parseMarkdown(body)): NoteSection {
  const all = headings(tree);
  const sections = all.filter((heading) => heading.depth === 2 && /^## Notes[ \t]*$/.test(headingSource(body, heading)));
  if (sections.length > 1) throw new NoteFormatError("Task contains multiple Notes sections.", sections[1].position.start.line);
  if (!sections.length) return { before: body, after: "", notes: [] };
  const section = sections[0];
  const start = section.position.start.offset!;
  const contentStart = section.position.end.offset!;
  const next = all.find((heading) => heading.depth <= 2 && heading.position.start.offset! > start);
  const end = next?.position.start.offset ?? body.length;
  const entries: { id: string; heading: LocatedHeading }[] = [];
  for (const heading of all) {
    const offset = heading.position.start.offset!;
    if (heading.depth !== 3 || offset < contentStart || offset >= end) continue;
    const id = /^### (N\d{3,})[ \t]*$/.exec(headingSource(body, heading))?.[1];
    if (id) entries.push({ id, heading });
  }

  const line = section.position.start.line;
  if (body.slice(contentStart, entries[0]?.heading.position.start.offset ?? end).trim()) {
    throw new NoteFormatError(entries.length ? "Malformed text before the first task note." : "Malformed task notes section.", line);
  }
  const ids = new Set<string>();
  const notes = entries.map(({ id, heading }, index) => {
    const noteLine = heading.position.start.line;
    if (ids.has(id)) throw new NoteFormatError(`Duplicate task note: ${id}`, noteLine);
    if (!Number.isSafeInteger(Number(id.slice(1)))) throw new NoteFormatError(`Invalid task note ID: ${id}`, noteLine);
    ids.add(id);
    const text = body.slice(
      heading.position.end.offset, entries[index + 1]?.heading.position.start.offset ?? end
    ).trim();
    if (!text) throw new NoteFormatError(`Empty task note: ${id}`, noteLine);
    return { id, text };
  });
  return { before: body.slice(0, start), after: body.slice(end), notes };
}

export function hasReservedNoteHeading(text: string): boolean {
  return headings(parseMarkdown(text)).some((heading) =>
    heading.depth <= 2 || (heading.depth === 3 && /^### N\d{3,}[ \t]*$/.test(headingSource(text, heading))));
}
