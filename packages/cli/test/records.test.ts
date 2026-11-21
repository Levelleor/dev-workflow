import { describe, expect, it } from "vitest";
import { addRecord, findRecord, listRecords } from "../src/records.js";
import { fixture } from "./fixtures.js";

describe("versioned knowledge and work records", () => {
  it("creates indexed PRDs, ADRs and stories with stable IDs", () => {
    const { fs, initialize } = fixture();
    initialize();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Build a simple editor" });
    const adr = addRecord(fs, "/repo", { type: "adr", title: "Use embedded storage", related: [prd.id] });
    const first = addRecord(fs, "/repo", { type: "story", title: "Create a document", parent: prd.id, related: [adr.id] });
    const second = addRecord(fs, "/repo", { type: "story", title: "Rename a document", parent: prd.id });
    expect([first.id, second.id]).toEqual(["STORY-0001", "STORY-0002"]);
    expect(listRecords(fs, "/repo", "story")).toHaveLength(2);
    expect(findRecord(fs, "/repo", first.id).metadata.parent).toBe(prd.id);
    expect(fs.readFileSync("/repo/docs/work/items/README.md", "utf8")).toContain("[STORY-0001: Create a document]");
    expect(fs.readFileSync("/repo/docs/decisions/README.md", "utf8")).toContain(adr.id);
  });

  it("rejects invalid relationships and retains provenance for inbox notes", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(() => addRecord(fs, "/repo", { type: "story", title: "Orphan" })).toThrow(/--parent/);
    expect(() => addRecord(fs, "/repo", { type: "story", title: "Bad parent", parent: "PRD-9999" })).toThrow(/Unknown PRD/);
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Service" });
    const note = addRecord(fs, "/repo", { type: "note", title: "Possible issue", source: prd.id });
    expect(note.metadata.source).toBe(prd.id);
    expect(() => addRecord(fs, "/repo", { type: "adr", title: "Bad link", related: ["ADR-9999"] })).toThrow(/Unknown related/);
  });
});
