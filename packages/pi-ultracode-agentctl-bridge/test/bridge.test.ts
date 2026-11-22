import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bridge, { allowedArguments, createAgentctlCapabilities, type Executor } from "../src/bridge.js";

const CWD = process.cwd();
const CONTEXT = { cwd: CWD, signal: new AbortController().signal };

describe("restricted pi-ultracode-agentctl-bridge", () => {
  it("maps only fixed, validated agentctl operations", () => {
    expect(allowedArguments("write", { op: "claim" })).toEqual(["task", "claim", "next", "--json"]);
    expect(allowedArguments("write", { op: "claim", id: "STORY-0002" })).toEqual(["task", "claim", "STORY-0002", "--json"]);
    expect(allowedArguments("write", { op: "complete", id: "STORY-0002" })).toEqual(["task", "complete", "STORY-0002", "--json"]);
    expect(allowedArguments("write", { op: "note-add", id: "STORY-0002", text: "Fix timeout" })).toEqual([
      "task", "STORY-0002", "notes", "add", "Fix timeout", "--json",
    ]);
    expect(allowedArguments("read", { op: "context", id: "STORY-0002" })).toEqual(["task", "getcontext", "STORY-0002", "--json"]);
    expect(allowedArguments("read", { op: "snapshot", id: "STORY-0002" })).toEqual(["task", "snapshot", "STORY-0002", "--json"]);
    expect(allowedArguments("read", { op: "snapshot" })).toEqual(["task", "snapshot", "--json"]);
    expect(() => allowedArguments("read", { op: "models" })).toThrow(); // Models are included in snapshot.
    expect(allowedArguments("read", { op: "list" })).toEqual(["work", "list", "--json"]);
    expect(allowedArguments("verify", {})).toEqual(["verify", "--json"]);
    expect(allowedArguments("verify", { gate: "unit" })).toEqual(["verify", "unit", "--json"]);
  });

  it("returns a batched model, context and gate snapshot with one subprocess", async () => {
    const expected = {
      context: { task: { id: "STORY-0002" }, prompt: "Implement story" },
      gates: [{ name: "unit", command: "npm test", required: true }],
      models: {
        roles: { worker: { model: "anthropic/claude-sonnet-4", thinking: "high" } },
        repairRetries: 1, reviewRetries: 2,
      },
    };
    const executor = vi.fn<Executor>(async () => ({
      exitCode: 0, stdout: JSON.stringify(expected), stderr: "",
    }));
    const capability = createAgentctlCapabilities(executor)[0];
    const response = await capability.execute({ op: "snapshot", id: "STORY-0002" }, CONTEXT);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      ["task", "snapshot", "STORY-0002", "--json"], CWD, CONTEXT.signal, 30000,
    );
    expect(response).toEqual({ exitCode: 0, value: expected });
  });

  it("rejects arbitrary executables, arguments, traversal and unknown operations", () => {
    for (const input of [
      { op: "shell", command: "rm -rf /" },
      { op: "claim", id: "../../evil" },
      { op: "claim", id: "STORY-0001", flag: "--help" },
      { op: "complete", id: "next" },
      { op: "note-remove", noteId: "N001; echo bad" },
    ]) expect(() => allowedArguments("write", input)).toThrow();
    expect(() => allowedArguments("read", { op: "ls" })).toThrow();
    expect(() => allowedArguments("read", { op: "snapshot", id: "../../outside" })).toThrow();
    expect(() => allowedArguments("verify", { gate: "all; whoami" })).toThrow();
    expect(() => allowedArguments("verify", { command: "sh" })).toThrow();
  });

  it("registers exactly three namespaced host capabilities synchronously", () => {
    const received: Array<{ name: string; effect: string }> = [];
    let callback: ((collector: { register: (value: never) => void }) => void) | undefined;
    bridge({ events: { on(name, handler) {
      expect(name).toBe("ultracode:host-capabilities:collect");
      callback = handler as typeof callback;
    } } });
    expect(callback).toBeDefined();
    callback!({ register: (value: never) => received.push(value) });
    expect(received).toEqual([
      { name: "agentctl.read", effect: "read" },
      { name: "agentctl.write", effect: "write" },
      { name: "agentctl.verify", effect: "write" },
    ].map(({ name, effect }) => expect.objectContaining({ name, effect })));
  });

  it("preserves valid verification failures as structured results, not exceptions", async () => {
    const executor: Executor = vi.fn(async (argv) => ({
      exitCode: argv[0] === "verify" ? 1 : 0,
      stdout: JSON.stringify({ passed: false, checks: [{ name: "unit", exitCode: 1 }] }),
      stderr: "unit failed",
    }));
    const capabilities = createAgentctlCapabilities(executor);
    const value = await capabilities[2].execute({}, CONTEXT);
    expect(value).toMatchObject({ exitCode: 1, value: { passed: false } });
  });

  it("rejects malformed child output and arbitrary non-verification failures", async () => {
    for (const [exitCode, stdout] of [[0, "bad json"], [7, "{}"]] as const) {
      const capability = createAgentctlCapabilities(async () => ({ exitCode, stdout, stderr: "error" }))[0];
      await expect(capability.execute({ op: "list" }, CONTEXT)).rejects.toThrow();
    }
  });

  it("passes a bounded validated project cwd and never accepts it from input", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentctl-bridge-"));
    try {
      const executor = vi.fn<Executor>(async () => ({ exitCode: 0, stdout: "{}", stderr: "" }));
      const capability = createAgentctlCapabilities(executor)[0];
      await capability.execute({ op: "list" }, { cwd: home, signal: CONTEXT.signal });
      expect(executor).toHaveBeenCalledWith(["work", "list", "--json"], home, CONTEXT.signal, 30000);
      await expect(capability.execute({ op: "list", cwd: "/" }, CONTEXT)).rejects.toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
