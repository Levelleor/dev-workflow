import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { fixture } from "./fixtures.js";

describe("command manuals", () => {
  it.each([
    [["init"], "init [DIRECTORY] [--json]"],
    [["doctor"], "doctor [--json]"],
    [["docs"], "docs <command> [args]"],
    [["docs", "lint"], "docs lint [--json]"],
    [["status"], "status [--json]"],
    [["task"], "task <command> [args]"],
    [["task", "claim"], "task claim <ID|next> [--json]"],
    [["task", "getcontext"], "task getcontext [ID] [--json]"],
    [["task", "complete"], "task complete [ID] [--json]"],
    [["task", "notes"], "task [ID] notes <command> [args]"],
    [["task", "notes", "add"], 'task [ID] notes add "TEXT" [--json]'],
    [["task", "STORY-0001", "notes", "add"], 'task [ID] notes add "TEXT" [--json]'],
    [["task", "notes", "list"], "task [ID] notes list [--json]"],
    [["task", "notes", "remove"], "task [ID] notes remove NOTE-ID [--json]"],
    [["work"], "work <command> [args]"],
    [["work", "list"], "work list [filters] [--fields LIST] [--limit N] [--json]"],
    [["work", "search"], "work search TEXT [filters] [--fields LIST] [--limit N] [--json]"],
    [["work", "show"], "work show ID [--body] [--json]"],
    [["work", "blockers"], "work blockers STORY-ID [--json]"],
    [["work", "add"], "work add --title TEXT --parent PRD-ID [--depends-on ID[,ID...]] [--blocked-by ID[,ID...]]"],
    [["knowledge"], "knowledge <command> [args]"],
    [["knowledge", "list"], "knowledge list [filters] [--fields LIST] [--limit N] [--json]"],
    [["knowledge", "search"], "knowledge search TEXT [filters] [--fields LIST] [--limit N] [--json]"],
    [["knowledge", "show"], "knowledge show ID [--body] [--json]"],
    [["knowledge", "add"], /^knowledge add --type .* --title TEXT \[--related ID\[,ID\.\.\.\]\]$/],
    [["knowledge", "capture"], "knowledge capture TITLE --source ID"],
    [["config"], "config <command> [args]"],
    [["config", "show"], "config show [--json]"],
    [["config", "get"], "config get KEY [--json]"],
    [["config", "set"], "config set KEY VALUE [--json]"],
    [["verify"], "verify [GATE | --profile NAME] [--json]"],
    [["verify", "scaffold"], "verify [GATE | --profile NAME] [--json]"],
    [["verify", "list"], "verify list [--json]"],
    [["verify", "add"], "verify add <GATE> [--timeout SECONDS] [--json] -- COMMAND [args...]"],
    [["help"], "help [COMMAND [SUBCOMMAND ...]]"],
    [["version"], "version"],
  ] satisfies [string[], string | RegExp][])("routes help for %j without a project", (path, usage) => {
    const { fs } = fixture();
    const output: string[] = [];
    const error: string[] = [];
    const options = { fs, cwd: "/outside", output: (value: string) => output.push(value), error: (value: string) => error.push(value) };
    for (const argv of [[...path, "-h"], [...path, "--help"], ["help", ...path]]) {
      expect(runCli(argv, options)).toBe(0);
    }

    const usageLine = output[0].split("\n")[0].replace(/^Usage: agentctl /, "");
    if (typeof usage === "string") expect(usageLine).toBe(usage);
    else expect(usageLine).toMatch(usage);
    expect(output).toEqual([output[0], output[0], output[0]]);
    expect(error).toEqual([]);
  });
});
