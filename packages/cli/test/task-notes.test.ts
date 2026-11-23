import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.js";
import { addRecord, findRecord } from "../src/records.js";
import { claimTask, getActiveTaskContext } from "../src/task.js";
import { addTaskNote, listTaskNotes, removeTaskNote } from "../src/task-notes.js";

function setup() {
  const { fs, initialize } = fixture();
  initialize();
  const product = addRecord(fs, "/repo", { type: "prd", title: "Product" });
  const task = addRecord(fs, "/repo", { type: "story", title: "Implement feature", parent: product.id });
  return { fs, task };
}

describe("task notes", () => {
  it("adds, lists and removes task notes while preserving the task", () => {
    const { fs, task } = setup();
    expect(claimTask(fs, "/repo", task.id).ok).toBe(true);
    expect(listTaskNotes(fs, "/repo")).toEqual({ taskId: task.id, notes: [] });
    const first = addTaskNote(fs, "/repo", "Investigate timeout");
    const second = addTaskNote(fs, "/repo", "Fix the expected status");
    expect([first.id, second.id]).toEqual(["N001", "N002"]);
    expect(listTaskNotes(fs, "/repo").notes).toEqual([first, second]);
    const context = getActiveTaskContext(fs, "/repo");
    expect(context.prompt).toContain("Investigate timeout");
    expect(context.prompt).toContain("N002");
    expect(removeTaskNote(fs, "/repo", "N001")).toEqual(first);
    expect(listTaskNotes(fs, "/repo").notes).toEqual([second]);
    expect(findRecord(fs, "/repo", task.id).status).toBe("in-progress");
    const document = fs.readFileSync(task.file, "utf8");
    expect(document).toContain("## Acceptance criteria");
    expect(document).not.toContain("note_sequence:");
    expect(document).not.toContain("Investigate timeout");
  });

  it("starts at N001 with no notes and derives IDs from remaining notes", () => {
    const { fs, task } = setup();
    expect(addTaskNote(fs, "/repo", "First", task.id).id).toBe("N001");
    expect(addTaskNote(fs, "/repo", "Second", task.id).id).toBe("N002");
    expect(removeTaskNote(fs, "/repo", "N002", task.id).id).toBe("N002");
    expect(addTaskNote(fs, "/repo", "Replacement", task.id).id).toBe("N002");
    expect(removeTaskNote(fs, "/repo", "N001", task.id).id).toBe("N001");
    expect(addTaskNote(fs, "/repo", "Third", task.id).id).toBe("N003");
    expect(removeTaskNote(fs, "/repo", "N002", task.id).id).toBe("N002");
    expect(removeTaskNote(fs, "/repo", "N003", task.id).id).toBe("N003");
    expect(addTaskNote(fs, "/repo", "Start again", task.id).id).toBe("N001");
    expect(listTaskNotes(fs, "/repo", task.id).notes).toEqual([{ id: "N001", text: "Start again" }]);
    expect(findRecord(fs, "/repo", task.id).status).toBe("pending");
  });

  it("uses the highest existing note number even if headings are out of order", () => {
    const { fs, task } = setup();
    fs.writeFileSync(task.file, fs.readFileSync(task.file, "utf8") +
      "\n## Notes\n\n### N004\nFourth\n\n### N002\nSecond\n");
    expect(addTaskNote(fs, "/repo", "Fifth", task.id).id).toBe("N005");
    expect(listTaskNotes(fs, "/repo", task.id).notes.map((note) => note.id))
      .toEqual(["N004", "N002", "N005"]);
  });

  it("ignores and removes a legacy note_sequence counter", () => {
    const { fs, task } = setup();
    const original = fs.readFileSync(task.file, "utf8");
    fs.writeFileSync(task.file, original.replace("status: pending",
      "status: pending\nnote_sequence: 99"));
    expect(addTaskNote(fs, "/repo", "First", task.id).id).toBe("N001");
    const updated = fs.readFileSync(task.file, "utf8");
    expect(updated).not.toContain("note_sequence:");
    expect(updated).toContain("status: pending");
  });

  it("does not edit another task when explicitly selected", () => {
    const { fs, task } = setup();
    const another = addRecord(fs, "/repo", { type: "story", title: "Other feature", parent: "PRD-0001" });
    addTaskNote(fs, "/repo", "Second task note", another.id);
    expect(listTaskNotes(fs, "/repo", another.id).notes).toHaveLength(1);
    expect(listTaskNotes(fs, "/repo", task.id).notes).toEqual([]);
  });

  it("rejects ambiguous current tasks, invalid notes and unknown IDs", () => {
    const { fs, task } = setup();
    expect(() => listTaskNotes(fs, "/repo")).toThrow(/No task in progress/);
    expect(() => addTaskNote(fs, "/repo", "hello")).toThrow(/No task in progress/);
    expect(() => addTaskNote(fs, "/repo", " ", task.id)).toThrow(/readable characters/);
    expect(() => addTaskNote(fs, "/repo", "## Extra section", task.id)).toThrow(/headings/);
    expect(() => removeTaskNote(fs, "/repo", "N999", task.id)).toThrow(/Unknown note/);
    expect(() => removeTaskNote(fs, "/repo", "foo", task.id)).toThrow(/Note ID/);
    expect(() => listTaskNotes(fs, "/repo", "STORY-9999")).toThrow(/Unknown task/);
  });

  it("rejects duplicate note IDs and does not change a stale note section", () => {
    const { fs, task } = setup();
    fs.writeFileSync(task.file, fs.readFileSync(task.file, "utf8") +
      "\n## Notes\n\n### N001\nOne\n\n### N001\nTwo\n");
    expect(() => addTaskNote(fs, "/repo", "Three", task.id)).toThrow(/Duplicate task note/);
    expect(fs.readFileSync(task.file, "utf8")).toContain("### N001\nTwo");
  });

  it("uses the same lock as task claims and never truncates files on a partial update", () => {
    const { fs, task } = setup();
    fs.mkdirSync("/repo/.agentctl/runtime/task.lock", { recursive: true });
    expect(() => addTaskNote(fs, "/repo", "Locked", task.id)).toThrow(/locked/);
    fs.rmdirSync("/repo/.agentctl/runtime/task.lock");
    fs.writeFileSync(`${task.file}.agentctl.tmp`, "partial");
    expect(() => addTaskNote(fs, "/repo", "New", task.id)).toThrow();
    expect(listTaskNotes(fs, "/repo", task.id).notes).toEqual([]);
    expect(fs.existsSync("/repo/.agentctl/runtime/task.lock")).toBe(false);
  });
});
