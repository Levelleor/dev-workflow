import { isMap, parseDocument } from "yaml";

export class FrontmatterError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
  }
}

export function readFrontmatter(raw: string) {
  const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(raw);
  if (!opening) return undefined;
  const start = opening[0].length;
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(raw.slice(start));
  if (!closing) throw new FrontmatterError("Missing closing YAML frontmatter delimiter.", 1);

  const end = start + closing.index;
  const bodyStart = end + closing[0].length;
  const document = parseDocument(raw.slice(start, end));
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) {
    const line = (problem.linePos?.[0]?.line ?? 1) + 1;
    throw new FrontmatterError(problem.message.split("\n")[0], line);
  }
  if (!isMap(document.contents)) throw new FrontmatterError("Frontmatter must be a YAML mapping.", 2);

  const keys = new Map<string, number>();
  for (const { key } of document.contents.items) {
    if (!key || typeof key !== "object" || !("value" in key) || typeof key.value !== "string") {
      throw new FrontmatterError("Frontmatter keys must be strings.", 2);
    }
    if ("range" in key && Array.isArray(key.range)) {
      const line = raw.slice(0, start + key.range[0]).split("\n").length;
      keys.set(key.value, line);
    }
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = document.toJS() as Record<string, unknown>;
  } catch (error) {
    throw new FrontmatterError(error instanceof Error ? error.message : String(error), 2);
  }
  return { start, end, bodyStart, body: raw.slice(bodyStart), metadata, document, keys };
}
