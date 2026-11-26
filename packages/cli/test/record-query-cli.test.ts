import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { runCli } from "../src/cli.js";
import type { RecordType } from "../src/records.js";
import { fixture } from "./fixtures.js";

const directories: Record<RecordType, string> = {
  story: "work/items", prd: "product", adr: "decisions", note: "knowledge/inbox",
};

function repository() {
  const { fs, initialize } = fixture();
  initialize();

  function record(type: RecordType, id: string, title: string, body = "", fields: Record<string, unknown> = {}) {
    const metadata = stringify({ id, type, status: "pending", ...fields }).trimEnd();
    const directory = `/repo/docs/${directories[type]}`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${id}.md`, `---\n${metadata}\n---\n\n# ${title}\n\n${body}\n`);
  }

  function call(...args: string[]) {
    let output = "";
    let error = "";
    const code = runCli(args, {
      fs, cwd: "/repo", output: (value) => { output = value; }, error: (value) => { error = value; },
    });
    return { code, output, error };
  }

  function json(...args: string[]) {
    const result = call(...args, "--json");
    expect(result.error).toBe("");
    expect(result.code).toBe(0);
    return JSON.parse(result.output);
  }

  return { record, call, json };
}

describe("record lookup commands", () => {
  it("shows command-specific help outside a project", () => {
    const { fs } = fixture();
    const output: string[] = [];
    const options = { fs, cwd: "/templates", output: (message: string) => output.push(message) };
    expect(runCli(["knowledge", "--help"], options)).toBe(0);
    expect(output[0]).toContain('agentctl knowledge search "task claims" --type adr');
    expect(output[0]).toContain("show ID [--body]");
    expect(output[0]).not.toContain("agentctl work");
    expect(runCli(["help", "work"], options)).toBe(0);
    expect(output[1]).toContain("--dependencies-of");
    expect(output[1]).toContain("agentctl work blockers");
  });

  it("ranks title matches ahead of body matches and returns bounded excerpts", () => {
    const { record, json, call } = repository();
    record("adr", "ADR-0001", "Repository workflow", `${"More context ".repeat(40)}Task claims change story state.`, { status: "accepted" });
    record("adr", "ADR-0002", "Task claims", "Use atomic locks.", { status: "accepted" });
    record("adr", "ADR-0003", "Task claims", "", { status: "proposed" });
    record("adr", "ADR-0004", "Partial match", "Task context", { status: "accepted" });
    const search = json("knowledge", "search", "TASK claims", "--type", "adr", "--status", "accepted");
    expect(search).toEqual({
      total: 2, hasMore: false,
      results: [
        { id: "ADR-0002", title: "Task claims", status: "accepted", type: "adr", excerpt: "" },
        { id: "ADR-0001", title: "Repository workflow", status: "accepted", type: "adr", excerpt: expect.stringContaining("Task claims change story state.") },
      ],
    });
    expect(search.results[1].excerpt.length).toBeLessThanOrEqual(162);
    expect(json("knowledge", "search", "claims atomic", "--fields", "id,excerpt").results)
      .toEqual([{ id: "ADR-0002", excerpt: "Use atomic locks." }]);
    expect(json("knowledge", "search", "accepted").results).toEqual([]);
    expect(json("knowledge", "search", "adr-0004").results[0].id).toBe("ADR-0004");
    expect(call("knowledge", "search", "ADR-0004", "--fields", "excerpt").output).toBe("-");
  });

  it("bounds search by default and reports how many records were omitted", () => {
    const { record, call, json } = repository();
    for (let index = 1; index <= 12; index++) {
      record("note", `NOTE-${String(index).padStart(4, "0")}`, "Workflow note", "An observation.");
    }
    const search = json("knowledge", "search", "workflow");
    expect(search.results).toHaveLength(10);
    expect(search).toMatchObject({ total: 12, hasMore: true });
    expect(search.results[0].id).toBe("NOTE-0001");
    const list = json("knowledge", "list", "--limit=1", "--fields", "id,title");
    expect(list).toEqual({ results: [{ id: "NOTE-0001", title: "Workflow note" }], total: 12, hasMore: true });
    expect(call("knowledge", "search", "workflow", "--limit", "2").output)
      .toContain("Showing 2 of 12 matches.");
    expect(call("knowledge", "search", "no results").output).toBe("No matches.");
  });

  it("combines relationship and date filters without requiring dates on legacy records", () => {
    const { record, json } = repository();
    const links = { status: "accepted", related: ["PRD-0001", "NOTE-0001"], supersedes: ["ADR-0009"] };
    record("adr", "ADR-0001", "Storage", "", { ...links, created_at: "2024-02-29", accepted_at: "2024-03-10" });
    record("adr", "ADR-0002", "Storage", "", { ...links, created_at: "2024-03-01", accepted_at: "2024-03-11" });
    record("adr", "ADR-0003", "Storage", "", links);
    record("adr", "ADR-0004", "Storage", "", { ...links, supersedes: ["ADR-0010"], created_at: "2024-02-29", accepted_at: "2024-03-10" });
    record("note", "NOTE-0001", "A note", "", { source: "STORY-0001" });
    record("note", "NOTE-0002", "Another note", "", { source: "STORY-0002" });
    expect(json("knowledge", "search", "storage", "--type", "adr", "--status", "accepted",
      "--related-to", "PRD-0001", "--supersedes", "ADR-0009", "--created-since", "2024-02-29",
      "--created-before", "2024-03-01", "--accepted-since", "2024-03-10", "--accepted-before", "2024-03-11",
      "--fields", "id,created_at,accepted_at",
    ).results).toEqual([{ id: "ADR-0001", created_at: "2024-02-29", accepted_at: "2024-03-10" }]);
    expect(json("knowledge", "list", "--supersedes", "ADR-0009", "--fields", "id")).toEqual([
      { id: "ADR-0001" }, { id: "ADR-0002" }, { id: "ADR-0003" },
    ]);
    expect(json("knowledge", "list", "--created-since", "2024-03-01", "--fields", "id")).toEqual([{ id: "ADR-0002" }]);
    expect(json("knowledge", "list", "--accepted-before", "2024-03-11", "--fields", "id"))
      .toEqual([{ id: "ADR-0001" }, { id: "ADR-0004" }]);
    expect(json("knowledge", "list", "--type", "note", "--source", "STORY-0001", "--fields", "id,source"))
      .toEqual([{ id: "NOTE-0001", source: "STORY-0001" }]);
  });

  it("records a UTC creation date for new records", () => {
    const { json } = repository();
    const before = new Date().toISOString().slice(0, 10);
    const result = json("knowledge", "add", "--type", "adr", "--title", "New decision");
    const after = new Date().toISOString().slice(0, 10);
    expect([before, after]).toContain(result.metadata.created_at);
    expect(json("knowledge", "list", "--created-since", before, "--fields", "id,created_at"))
      .toEqual([{ id: result.id, created_at: result.metadata.created_at }]);
  });

  it("searches stories and uses the scheduler's default priority", () => {
    const { record, json } = repository();
    record("story", "STORY-0001", "Current workflow", "", { parent: "PRD-0001" });
    record("story", "STORY-0002", "Future workflow", "", { parent: "PRD-0001", priority: 2 });
    record("story", "STORY-0003", "Another workflow", "", { parent: "PRD-0002", priority: 3 });
    record("story", "STORY-0004", "Finished workflow", "", { parent: "PRD-0001", status: "implemented" });
    expect(json("work", "search", "workflow", "--priority", "3", "--parent", "PRD-0001", "--status", "pending",
      "--fields", "id,title",
    ).results).toEqual([{ id: "STORY-0001", title: "Current workflow" }]);
    expect(json("knowledge", "search", "workflow").results).toEqual([]);
  });

  it("walks story dependencies in both directions with optional transitive lookup and field selection", () => {
    const { record, json, call } = repository();
    record("story", "STORY-0001", "Foundation", "Foundation details.", { status: "implemented" });
    record("story", "STORY-0002", "Follow-up", "Follow-up details.", { depends_on: ["STORY-0001"] });
    record("story", "STORY-0003", "Leaf", "", { blocked_by: ["STORY-0002", "STORY-9999"] });
    record("story", "STORY-0004", "Other", "");
    expect(json("work", "list", "--depends-on", "STORY-0001", "--fields", "id")).toEqual([{ id: "STORY-0002" }]);
    expect(json("work", "list", "--depends-on", "STORY-0001", "--transitive", "--fields", "id"))
      .toEqual([{ id: "STORY-0002" }, { id: "STORY-0003" }]);
    expect(json("work", "list", "--dependencies-of", "STORY-0003", "--fields", "id,title,body"))
      .toEqual([{ id: "STORY-0002", title: "Follow-up", body: "# Follow-up\n\nFollow-up details.\n" }]);
    expect(json("work", "list", "--dependencies-of", "STORY-0003", "--status", "implemented", "--transitive", "--fields", "id"))
      .toEqual([{ id: "STORY-0001" }]);
    expect(call("work", "list", "--dependencies-of", "STORY-0002", "--fields", "id,title,body").output)
      .toBe("STORY-0001\tFoundation\n# Foundation\n\nFoundation details.");
  });

  it("avoids revisiting cyclic or duplicate dependencies", () => {
    const { record, json } = repository();
    record("story", "STORY-0001", "One", "", { depends_on: ["STORY-0002", "STORY-0002"] });
    record("story", "STORY-0002", "Two", "", { depends_on: ["STORY-0003", "STORY-0001"] });
    record("story", "STORY-0003", "Three", "", { depends_on: ["STORY-0001"] });
    for (const flag of ["--depends-on", "--dependencies-of"]) {
      expect(json("work", "list", flag, "STORY-0001", "--transitive", "--fields", "id"))
        .toEqual([{ id: "STORY-0002" }, { id: "STORY-0003" }]);
    }
  });

  it("reports the task claimer's blockers without claiming the story", () => {
    const { record, call, json } = repository();
    record("prd", "PRD-0001", "Product");
    record("story", "STORY-0001", "Ready to claim", "", { parent: "PRD-0001" });
    record("story", "STORY-0002", "Blocked", "", {
      parent: "PRD-0001", blocked: true, depends_on: ["STORY-0001"], blocked_by: ["STORY-9999"],
    });
    const blockers = json("work", "blockers", "STORY-0002");
    expect(blockers).toEqual({
      id: "STORY-0002", reasons: ["Explicitly blocked", "Waiting for STORY-0001 [pending]", "Missing dependency: STORY-9999"],
    });
    const claim = call("task", "claim", "STORY-0002", "--json");
    expect(claim.code).toBe(2);
    expect(JSON.parse(claim.output).blocked).toEqual([blockers]);
    expect(json("work", "show", "STORY-0002").status).toBe("pending");
    expect(call("work", "blockers", "STORY-0001").output).toBe("No blockers for STORY-0001.");
  });

  it("reads a body directly while preserving the existing show and list formats", () => {
    const { record, call, json } = repository();
    record("adr", "ADR-0001", "Use SQLite", "## Decision\n\nUse SQLite.");
    record("story", "STORY-0001", "Add storage", "", { parent: "PRD-0001" });
    const body = "# Use SQLite\n\n## Decision\n\nUse SQLite.\n";
    expect(call("knowledge", "show", "ADR-0001", "--body").output).toBe(body);
    expect(json("knowledge", "show", "ADR-0001", "--body")).toBe(body);
    expect(call("knowledge", "show", "ADR-0001").output).toMatch(/^---\nid: ADR-0001\n/);
    expect(json("knowledge", "show", "ADR-0001")).toMatchObject({ body: `\n${body}`, metadata: { id: "ADR-0001" } });
    expect(call("work", "show", "STORY-0001", "--body").output).toBe("# Add storage\n\n\n");
    expect(json("knowledge", "list")).toEqual([{ id: "ADR-0001", title: "Use SQLite", type: "adr", status: "pending" }]);
    expect(json("work", "list")).toEqual([{ id: "STORY-0001", title: "Add storage", status: "pending", parent: "PRD-0001" }]);
  });

  it.each([
    [["knowledge", "search", " "], "Search text must not be empty"],
    [["knowledge", "list", "--status"], "--status requires a value"],
    [["knowledge", "list", "--accepted-since", "2025-02-29"], "valid YYYY-MM-DD date"],
    [["knowledge", "list", "--limit", "0"], "positive integer"],
    [["knowledge", "list", "--fields", "id,typo"], "Unknown result field: typo"],
    [["knowledge", "show", "ADR-0001", "--section", "Decision"], "Unknown option: --section"],
    [["work", "list", "--priority", "6"], "integer from 1 to 5"],
    [["work", "list", "--transitive"], "--transitive requires"],
    [["work", "list", "--depends-on", "STORY-0001", "--dependencies-of", "STORY-0002"], "Use either"],
    [["work", "list", "--dependencies-of", "STORY-9999"], "Unknown story: STORY-9999"],
  ])("reports invalid query arguments %j", (args, message) => {
    const { call } = repository();
    expect(call(...args)).toMatchObject({ code: 1, error: expect.stringContaining(message) });
  });
});
