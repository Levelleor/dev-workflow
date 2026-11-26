import type { RecordEntry } from "./records.js";
import { taskDependencyIds, taskPriority } from "./task.js";

export type RecordFilters = {
  status?: string;
  parent?: string;
  priority?: number;
  relatedTo?: string;
  source?: string;
  supersedes?: string;
  createdSince?: string;
  createdBefore?: string;
  acceptedSince?: string;
  acceptedBefore?: string;
};

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 10) === value;
}

function dateInRange(value: unknown, since?: string, before?: string): boolean {
  if (!since && !before) return true;
  return isCalendarDate(value) && (!since || value >= since) && (!before || value < before);
}

function hasId(value: unknown, id: string): boolean {
  return Array.isArray(value) && value.includes(id);
}

export function matchesRecord(record: RecordEntry, filters: RecordFilters): boolean {
  const { metadata } = record;
  return (!filters.status || record.status === filters.status)
    && (!filters.parent || metadata.parent === filters.parent)
    && (!filters.source || metadata.source === filters.source)
    && (!filters.relatedTo || hasId(metadata.related, filters.relatedTo))
    && (!filters.supersedes || hasId(metadata.supersedes, filters.supersedes))
    && dateInRange(metadata.created_at, filters.createdSince, filters.createdBefore)
    && dateInRange(metadata.accepted_at, filters.acceptedSince, filters.acceptedBefore)
    && (filters.priority === undefined || (record.type === "story" && taskPriority(record) === filters.priority));
}

export function storyById(records: readonly RecordEntry[], id: string): RecordEntry {
  const matches = records.filter((record) => record.type === "story" && record.id === id);
  if (matches.length > 1) throw new Error(`Multiple stories use the ID ${id}.`);
  if (matches.length === 0) throw new Error(`Unknown story: ${id}`);
  return matches[0];
}

export function walkDependencies(
  stories: readonly RecordEntry[],
  id: string,
  direction: "dependencies" | "dependents",
  transitive: boolean,
): Set<string> {
  const anchor = storyById(stories, id);
  const edges = new Map<string, string[]>();
  if (direction === "dependents") {
    for (const story of stories) {
      for (const dependency of taskDependencyIds(story)) {
        const dependents = edges.get(dependency);
        if (dependents) dependents.push(story.id);
        else edges.set(dependency, [story.id]);
      }
    }
  }

  const byId = new Map(stories.map((story) => [story.id, story]));
  const neighbors = (story: RecordEntry) =>
    direction === "dependencies" ? taskDependencyIds(story) : edges.get(story.id) ?? [];
  const visited = new Set([id]);
  const queue = [anchor];
  for (const story of queue) {
    for (const neighbor of neighbors(story)) {
      const linked = byId.get(neighbor);
      if (!linked || visited.has(neighbor)) continue;
      visited.add(neighbor);
      if (transitive) queue.push(linked);
    }
  }
  visited.delete(id);
  return visited;
}

export function recordBody(record: RecordEntry): string {
  return record.body.replace(/^(?:[ \t]*\r?\n)+/, "");
}

type SearchResult = { record: RecordEntry; score: number; excerpt: string };

function excerptOf(text: string, terms: readonly string[]): string {
  let bestLine = "";
  let bestCount = 0;
  let bestStart = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const normalized = line.toLowerCase();
    const hits = terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0);
    if (hits.length > bestCount) {
      bestLine = line;
      bestCount = hits.length;
      bestStart = Math.min(...hits);
    }
  }
  const width = 160;
  const start = Math.max(0, Math.min(bestStart - 36, bestLine.length - width));
  const end = start + width;
  return `${start ? "…" : ""}${bestLine.slice(start, end)}${end < bestLine.length ? "…" : ""}`;
}

export function searchRecords(records: readonly RecordEntry[], query: string): SearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) throw new Error("Search text must not be empty.");
  const terms = [...new Set(normalized.split(/\s+/))];
  const phrase = normalized.replace(/\s+/g, " ");
  const matches: SearchResult[] = [];

  for (const record of records) {
    const id = record.id.toLowerCase();
    const title = record.title.toLowerCase();
    const body = recordBody(record).replace(/^#[ \t]+[^\r\n]*(?:\r?\n|$)/, "");
    const text = body.toLowerCase();
    if (!terms.every((term) => id.includes(term) || title.includes(term) || text.includes(term))) continue;

    let score = id === phrase ? 100 : 0;
    if (title.includes(phrase)) score += 24;
    if (text.includes(phrase)) score += 8;
    for (const term of terms) {
      if (id.includes(term) || title.includes(term)) score += 4;
      if (text.includes(term)) score += 1;
    }
    matches.push({ record, score, excerpt: excerptOf(body, terms) });
  }
  return matches.sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));
}
