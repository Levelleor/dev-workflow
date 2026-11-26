import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { addRecord } from "../src/records.js";
import { fixture } from "./fixtures.js";

function repository() {
  const { fs, mem, initialize } = fixture();
  initialize();
  fs.mkdirSync("/repo/drafts", { recursive: true });

  function call(args: string[], stdin?: () => string, cwd = "/repo/drafts") {
    const output: string[] = [];
    const errors: string[] = [];
    const code = runCli(args, {
      fs, cwd, stdin, output: (text) => output.push(text), error: (text) => errors.push(text),
    });
    return { code, output: output.join("\n"), error: errors.join("\n") };
  }
  return { fs, mem, call };
}

describe("section-based record creation", () => {
  it("explains the input modes and section names in creation help outside a project", () => {
    const { call } = repository();
    for (const flag of ["-h", "--help"]) {
      const result = call(["knowledge", "add", flag], undefined, "/outside");
      expect(result.code).toBe(0);
      expect(result.output).toContain("Usage: agentctl knowledge add");
      expect(result.output).toContain("--section NAME=TEXT");
      expect(result.output).toContain("--section-file NAME=PATH");
      expect(result.output).toContain("--section-file NAME=-");
      expect(result.output).toContain("<<'MARKDOWN'");
      expect(result.output).toContain("adr (docs/decisions/)  context, decision, consequences");
      expect(result.output).toContain("brainstorm (docs/knowledge/brainstorming/)");
    }
    const selected = call(["knowledge", "add", "--type", "adr", "-h"], undefined, "/outside");
    expect(selected.output).toContain("adr (docs/decisions/)");
    expect(selected.output).not.toContain("brainstorm (");
    expect(call(["work", "add", "-h"]).output).toContain("outcome, acceptance-criteria, verification-plan");
  });

  it("preserves inline equals signs and rich Markdown from a file and stdin in canonical order", () => {
    const { fs, call } = repository();
    const context = "[Conventions](../conventions.md) explain project rules.\n";
    fs.writeFileSync("/repo/drafts/context.md", context);
    const input = [
      "> SQLite's readers see a \"consistent\" view.",
      "Set `mode=WAL` with no changes to $CONFIG.",
      "",
      "### Operational details",
      "",
      "```md",
      "## Notes",
      "[example](does-not-exist.md)",
      "```",
    ].join("\n");
    const created = call([
      "knowledge", "add", "--type", "adr", "--title", "Choose [SQLite]",
      "--section=consequences=Expect mode=WAL.", "--section-file", "decision=-",
      "--section-file", "context=context.md", "--json",
    ], () => input);
    expect(created.error).toBe("");
    expect(created.code).toBe(0);
    const record = JSON.parse(created.output);
    expect(record.title).toBe("Choose [SQLite]");
    const body = call(["knowledge", "show", record.id, "--body"]);
    expect(body.output).toContain(`## Context\n\n${context.trimEnd()}\n\n## Decision\n\n${input}\n\n## Consequences\n\nExpect mode=WAL.`);
    expect(fs.readFileSync("/repo/drafts/context.md", "utf8")).toBe(context);
    expect(call(["docs", "lint", "--json"]).output).toContain('"ok": true');
  });

  it("rejects conflicting section sources before reading stdin and rejects sections that break the document", () => {
    const { fs, call } = repository();
    const base = ["knowledge", "add", "--type", "adr", "--title", "Storage"];
    const stdin = vi.fn(() => "Text.");
    for (const [flags, message] of [
      [["--section", "proposal=Wrong"], "Unknown section 'proposal'"],
      [["--section-file", "decision=-", "--section", "decision=Duplicate"], "supplied more than once"],
      [["--section-file", "decision=-", "--section-file", "context=-"], "Only one section"],
      [["--section"], "NAME=TEXT"],
      [["--section", "context=## Extra"], "level-one or level-two"],
      [["--section", "context=```\nunclosed"], "Close the Markdown block"],
      [["--section-file", "context=missing.md"], "Cannot read section 'context'"],
    ] as const) {
      const result = call([...base, ...flags], stdin);
      expect(result).toMatchObject({ code: 1, error: expect.stringContaining(message) });
    }
    expect(stdin).not.toHaveBeenCalled();
    expect(fs.readdirSync("/repo/docs/decisions")).toEqual(["README.md"]);
  });

  it("validates story dependencies and candidate links before changing the record or its index", () => {
    const { fs, call } = repository();
    const product = addRecord(fs, "/repo", { type: "prd", title: "Service" });
    const first = addRecord(fs, "/repo", { type: "story", title: "First", parent: product.id });
    const index = "/repo/docs/work/items/README.md";
    const before = fs.readFileSync(index, "utf8");
    const base = ["work", "add", "--title", "Second", "--parent", product.id];
    for (const [flags, message] of [
      [["--depends-on", product.id], "Unknown depends_on story record"],
      [["--blocked-by", "STORY-0002"], "cannot reference itself"],
      [["--section", "outcome=[Example](missing.md)"], "Missing repository link target"],
      [["--section", "outcome=[Example](#missing)"], "Missing Markdown anchor"],
      [["--section", "outcome=[Example][missing]"], "undefined definition"],
    ] as const) {
      expect(call([...base, ...flags])).toMatchObject({ code: 1, error: expect.stringContaining(message) });
      expect(fs.readFileSync(index, "utf8")).toBe(before);
      expect(fs.existsSync("/repo/docs/work/items/STORY-0002-second.md")).toBe(false);
    }
    const created = call([
      ...base, "--depends-on", first.id, "--blocked-by", first.id, "--section", "outcome=[Criteria](#acceptance-criteria)", "--json",
    ]);
    expect(created.code).toBe(0);
    expect(JSON.parse(created.output).metadata).toMatchObject({ depends_on: [first.id], blocked_by: [first.id] });
  });

  it("rolls back the new record when it cannot atomically update the index", () => {
    const { fs, call } = repository();
    const directory = "/repo/docs/decisions";
    const index = `${directory}/README.md`;
    const before = fs.readFileSync(index, "utf8");
    fs.writeFileSync(`${index}.agentctl.tmp`, "Existing temp file");
    const args = ["knowledge", "add", "--type", "adr", "--title", "Use disk"];
    expect(call(args).code).toBe(1);
    expect(fs.readFileSync(index, "utf8")).toBe(before);
    expect(fs.readFileSync(`${index}.agentctl.tmp`, "utf8")).toBe("Existing temp file");
    expect(fs.existsSync(`${directory}/ADR-0001-use-disk.md`)).toBe(false);
    fs.unlinkSync(`${index}.agentctl.tmp`);
    expect(call(args).code).toBe(0);
  });
});

describe("document linting", () => {
  it("resolves workflow IDs and includes them as task context references", () => {
    const { fs, call } = repository();
    fs.mkdirSync("/repo/workflows");
    fs.writeFileSync("/repo/workflows/feature.md", "---\nid: FLOW-001\ntype: workflow\nstatus: active\n---\n\n# Workflow\n");
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Service", related: ["FLOW-001"] });
    const story = addRecord(fs, "/repo", { type: "story", title: "First", parent: prd.id });
    expect(call(["task", "claim", story.id]).code).toBe(0);
    const context = call(["task", "getcontext", story.id, "--json"]);
    expect(context.code).toBe(0);
    expect(JSON.parse(context.output).references).toContain("workflows/feature.md");
    expect(call(["docs", "lint"]).code).toBe(0);
  });

  it("reports malformed YAML, duplicate records, dangling relationships, local targets and notes through lint and doctor", () => {
    const { fs, call } = repository();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Service" });
    const story = addRecord(fs, "/repo", { type: "story", title: "First", parent: prd.id });
    const raw = fs.readFileSync(story.file, "utf8");
    fs.writeFileSync(story.file, raw.replace("depends_on: []", "depends_on: [STORY-9999]")
      + "\n[Missing](/docs/absent.md)\n\n## Notes\n\nOrphan text\n");
    fs.writeFileSync("/repo/docs/work/items/STORY-0001-duplicate.md", raw);
    fs.writeFileSync("/repo/docs/bad.md", "---\nkey: first\nkey: second\n---\n");
    const lint = call(["docs", "lint", "--json"]);
    expect(lint.code).toBe(1);
    const { ok, diagnostics } = JSON.parse(lint.output);
    expect(ok).toBe(false);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "docs/bad.md", line: 3, code: "frontmatter" }),
      expect.objectContaining({ path: "docs/work/items/STORY-0001-first.md", code: "duplicate-id" }),
      expect.objectContaining({ code: "relationship", message: expect.stringContaining("STORY-9999") }),
      expect.objectContaining({ code: "link-target", message: expect.stringContaining("/docs/absent.md") }),
      expect.objectContaining({ code: "task-notes" }),
    ]));
    const doctor = call(["doctor", "--json"]);
    expect(doctor.code).toBe(1);
    expect(JSON.parse(doctor.output).problems).toHaveLength(diagnostics.length);
  });

  it("checks duplicate heading anchors and reference links after a target heading changes", () => {
    const { fs, mem, call } = repository();
    fs.writeFileSync("/repo/docs/target file.md", "# Target\n\n## Repeated!\n\n## Repeated!\n");
    fs.writeFileSync("/repo/docs/links.md", [
      "# Links", "", "[second][ref]", "[root file](/AGENTS.md)", "[external](https://example.invalid/)",
      "", "[ref]: target%20file.md#repeated-1", "", "```md", "[ignored](missing.md)", "```", "",
    ].join("\n"));
    expect(call(["docs", "lint"]).code).toBe(0);

    fs.writeFileSync("/repo/docs/target file.md", "# Target\n\n## Repeated!\n\n## Renamed\n");
    expect(call(["docs", "lint"]).output).toContain("Missing Markdown anchor 'repeated-1'");
    fs.renameSync("/repo/docs/target file.md", "/repo/docs/renamed.md");
    expect(call(["docs", "lint"]).output).toContain("Missing repository link target");

    mem.writeFileSync("/outside.md", "# An outside file\n");
    mem.symlinkSync("/outside.md", "/repo/outside.md");
    fs.writeFileSync("/repo/docs/links.md", "[outside](/outside.md)\n");
    expect(call(["docs", "lint"]).output).toContain("Repository link leaves the project");
  });

  it("validates note links and preserves Markdown examples with reserved heading text", () => {
    const { fs, call } = repository();
    const prd = addRecord(fs, "/repo", { type: "prd", title: "Service" });
    const story = addRecord(fs, "/repo", { type: "story", title: "First", parent: prd.id });
    const base = ["task", story.id, "notes", "add"];
    const old = fs.readFileSync(story.file, "utf8");
    expect(call([...base, "[missing](absent.md)"]).error).toContain("Missing repository link target");
    expect(fs.readFileSync(story.file, "utf8")).toBe(old);
    const note = "```md\n## Notes\n### N999\n```";
    expect(call([...base, note]).code).toBe(0);
    const listed = call(["task", story.id, "notes", "list", "--json"]);
    expect(JSON.parse(listed.output).notes).toEqual([{ id: "N001", text: note }]);
    expect(call(["docs", "lint"]).code).toBe(0);
  });
});
