import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createExtensionRuntime, ExtensionRunner, SessionManager } from "@earendil-works/pi-coding-agent";
import { collectHostCapabilities } from "../src/workflow/host-capabilities.ts";
import { runWorkflow } from "../src/workflow/runtime.ts";
import { RunJournal, hashString } from "../src/workflow/journal.ts";
import { resolveRepositoryContext } from "../src/workflow/repository-context.ts";

const bridgeFile = process.env.AGENTCTL_BRIDGE_JS;
const cliFile = process.env.AGENTCTL_CLI_JS;
const workflowFile = process.env.AGENTCTL_WORKFLOW_FILE;
assert.ok(bridgeFile && cliFile && workflowFile, "CI must supply built bridge, CLI and workflow paths");

const bridge = await import(pathToFileURL(bridgeFile).href);
const workflow = fs.readFileSync(workflowFile, "utf8");

function cli(cwd: string, args: string[]): string {
  return execFileSync(process.execPath, [cliFile!, ...args], { cwd, encoding: "utf8" });
}
function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
async function project(run: (cwd: string) => Promise<void>) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agentctl-workflow-"));
  try {
    git(cwd, ["init", "-q"]);
    git(cwd, ["config", "user.email", "test@example.invalid"]);
    git(cwd, ["config", "user.name", "CI"]);
    cli(cwd, ["init"]);
    const roles = process.env.AGENTCTL_ROLES_DIR!;
    const destination = path.join(cwd, ".pi/ultracode/agents");
    fs.mkdirSync(destination, { recursive: true });
    for (const name of ["agentctl-implementer.md", "agentctl-reviewer.md", "agentctl-publisher.md"]) {
      fs.copyFileSync(path.join(roles, name), path.join(destination, name));
    }
    cli(cwd, ["knowledge", "add", "--type", "prd", "--title", "E2E requirement"]);
    cli(cwd, ["work", "add", "--title", "Implement E2E", "--parent", "PRD-0001"]);
    cli(cwd, ["verify", "add", "green", "--", "node", "-e", "process.exit(0)"]);
    return await run(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function modelConfig(cwd: string, from: string, to: string): void {
  const file = path.join(cwd, ".agentctl", "models.yaml");
  const config = fs.readFileSync(file, "utf8");
  assert.ok(config.includes(from), "Missing model config fixture: " + from);
  fs.writeFileSync(file, config.replace(from, to));
}

function journal(cwd: string, source = workflow) {
  const header = {
    type: "run" as const, runId: "agentctl-sequential-test",
    name: "agentctl-sequential-feature", scriptHash: hashString(source),
    targetIdentity: resolveRepositoryContext(cwd).identity,
    projectTrusted: true, startedAt: Date.now(),
  };
  return RunJournal.create(path.join(cwd, "test-runs"), header);
}

function fakeRunner(cwd: string, options: {
  repairAt?: number; reviewerRejections?: number; everPass?: boolean;
} = {}) {
  const calls: Array<{ label: string; prompt: string; modelPattern?: string }> = [];
  let implementationRuns = 0;
  let reviewRuns = 0;
  return {
    calls,
    runner: {
      async run(call: { label: string; prompt: string; modelPattern?: string }) {
        calls.push({ label: call.label, prompt: call.prompt, modelPattern: call.modelPattern });
        let value: unknown;
        if (call.label.includes("lookup")) value = "src/index.ts, requirement from PRD-0001";
        else if (call.label.includes("implementation") || call.label === "cheap repair") {
          implementationRuns++;
          if (options.repairAt && implementationRuns >= options.repairAt) {
            fs.writeFileSync(path.join(cwd, "passed.flag"), "yes");
          }
          value = { completed: true, summary: "Implementation run " + implementationRuns, blockers: [] };
        } else if (call.label.includes("review")) {
          reviewRuns++;
          value = reviewRuns <= (options.reviewerRejections ?? 0)
            ? { approved: false, summary: "Missing edge case", findings: ["Handle negative input"] }
            : { approved: true, summary: "Requirement met", findings: [] };
        } else if (call.label.includes("publish")) {
          value = { completed: true, summary: "https://github.com/Levelleor/dev-workflow/pull/123", blockers: [] };
        } else throw new Error("Unexpected Pi subagent: " + call.label);
        return { value, usage: { outputTokens: 1, totalTokens: 1, cost: 0 }, cwd };
      },
    },
  };
}

/** Uses the real Pi ExtensionRunner event system, not a hand-written event mock. */
function registeredWithPi() {
  const handlers = new Map<string, Array<(arg: any) => void>>();
  const pi = { events: { on(name: string, handler: (arg: any) => void) {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  } } };
  bridge.default(pi);
  const runner = new ExtensionRunner([
    {
      path: "agentctl-bridge", resolvedPath: "agentctl-bridge",
      sourceInfo: { path: "agentctl-bridge", source: "test", scope: "temporary", origin: "top-level" },
      handlers, tools: new Map(), messageRenderers: new Map(), commands: new Map(),
      flags: new Map(), shortcuts: new Map(),
    },
  ], createExtensionRuntime(), process.cwd(), SessionManager.inMemory(), {
    getAvailable: () => [], getAvailableOfType: () => [],
  } as any);
  runner.bindCore({ getThinkingLevel: () => "medium" } as any,
    { getModel: () => undefined, getSignal: () => undefined } as any);
  const collected = collectHostCapabilities({
    emit(name: string, payload: unknown) {
      // Pi's real extension runner sends the custom event to its actual handlers.
      // In this test, we explicitly deliver the event using the same registered handlers.
      for (const handler of handlers.get(name) ?? []) handler(payload);
    },
  });
  assert.ok(runner);
  return collected;
}

async function execute(cwd: string, behaviour: Parameters<typeof fakeRunner>[1] = {}, source = workflow) {
  const handle = journal(cwd, source);
  const fake = fakeRunner(cwd, behaviour);
  try {
    const result = await runWorkflow(source, {
      cwd, args: { taskId: "next" }, projectTrusted: true,
      hostCapabilities: registeredWithPi(),
      hostCapabilityGrants: ["agentctl.read", "agentctl.write", "agentctl.verify"],
      runner: fake.runner,
      journal: handle,
      maxAgents: 20,
    });
    return { result: result.result as Record<string, any>, calls: fake.calls };
  } finally {
    handle.close();
  }
}

test("settings are read independently of task context and verification gates", () => {
  assert.match(workflow, /op: "models"/);
  assert.match(workflow, /op: "context"/);
  assert.match(workflow, /op: "gates"/);
  assert.doesNotMatch(workflow, /op: "snapshot"/);
});

test("Pi host registers exactly three validated capabilities", () => {
  const caps = registeredWithPi();
  assert.deepEqual(caps.map((cap) => cap.name), ["agentctl.read", "agentctl.write", "agentctl.verify"]);
  assert.deepEqual(caps.map((cap) => cap.effect), ["read", "write", "write"]);
});

test("real Ultracode workflow claims through CLI, verifies, reviews and completes", async () => {
  await project(async (cwd) => {
    const result = await execute(cwd);
    assert.equal(result.result.status, "implemented");
    assert.equal(result.result.id, "STORY-0001");
    assert.equal(result.result.reviewRounds, 1);
    assert.match(result.calls.find((call) => call.label === "cheap implementation")!.prompt, /E2E requirement/);
    assert.ok(result.calls.some((call) => call.label === "independent review"));
    assert.ok(result.calls.find((call) => call.label === "cheap task lookup")!.modelPattern?.endsWith(":medium"));
    assert.ok(result.calls.find((call) => call.label === "independent review")!.modelPattern?.endsWith(":medium"));
    assert.ok(result.calls.some((call) => call.label === "publish accepted PR"));
    assert.match(fs.readFileSync(path.join(cwd, "docs/work/items/STORY-0001-implement-e2e.md"), "utf8"), /status: implemented/);
  });
});

test("Pi workflow uses exactly one cheap retry then the stronger model", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  dynamic:",
      "    command: " + JSON.stringify(`node -e "process.exit(require('fs').existsSync('passed.flag') ? 0 : 1)"`),
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [dynamic]", "",
    ].join("\n"));
    const { result, calls } = await execute(cwd, { repairAt: 3 });
    assert.equal(result.status, "implemented");
    assert.deepEqual(calls.filter((call) => /implementation|repair/.test(call.label)).map((call) => call.label),
      ["cheap implementation", "cheap repair", "strong implementation"]);
    assert.ok(calls.find((call) => call.label === "strong implementation")!.modelPattern?.includes("gpt"));
    assert.ok(calls.find((call) => call.label === "strong implementation")!.modelPattern?.endsWith(":high"));
  });
});

test("Pi workflow enforces three review rounds before escalation", async () => {
  await project(async (cwd) => {
    const { result, calls } = await execute(cwd, { reviewerRejections: 3 });
    assert.equal(result.status, "escalated");
    assert.equal(result.reviewRounds, 3);
    assert.equal(calls.filter((c) => c.label === "independent review").length, 3);
    assert.equal(calls.filter((c) => c.label === "publish accepted PR").length, 0);
    assert.match(fs.readFileSync(path.join(cwd, "docs/work/items/STORY-0001-implement-e2e.md"), "utf8"), /status: in-progress/);
  });
});

test("Pi workflow stops after exhausted verification escalation", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  fail:", "    command: node -e 'process.exit(1)'",
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [fail]", "",
    ].join("\n"));
    const { result, calls } = await execute(cwd);
    assert.equal(result.status, "escalated");
    assert.equal(calls.filter((c) => /implementation|repair/.test(c.label)).length, 3);
    assert.equal(calls.filter((c) => c.label === "independent review").length, 0);
  });
});

test("omitting thinking inherits the role/Pi thinking effort without a suffix", async () => {
  await project(async (cwd) => {
    modelConfig(cwd,
      "  worker:\n    model: deepseek/deepseek-flash\n    thinking: medium",
      "  worker:\n    model: deepseek/deepseek-flash",
    );
    const { result, calls } = await execute(cwd);
    assert.equal(result.status, "implemented");
    assert.equal(calls.find((call) => call.label === "cheap implementation")!.modelPattern, "deepseek/deepseek-flash");
  });
});

test("omitting model and thinking delegates selection to Pi", async () => {
  await project(async (cwd) => {
    modelConfig(cwd,
      "  worker:\n    model: deepseek/deepseek-flash\n    thinking: medium",
      "  worker: {}",
    );
    const { result, calls } = await execute(cwd);
    assert.equal(result.status, "implemented");
    assert.equal(calls.find((call) => call.label === "cheap implementation")!.modelPattern, undefined);
  });
});

test("thinking without a model overrides effort while inheriting Pi's model", async () => {
  await project(async (cwd) => {
    modelConfig(cwd,
      "  worker:\n    model: deepseek/deepseek-flash\n    thinking: medium",
      "  worker:\n    thinking: high",
    );
    const { result, calls } = await execute(cwd);
    assert.equal(result.status, "implemented");
    assert.equal(calls.find((call) => call.label === "cheap implementation")!.modelPattern, ":high");
  });
});

test("repairRetries zero permits only the initial implementation attempt", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  fail:",
      "    command: node -e 'process.exit(1)'",
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [fail]", "",
    ].join("\n"));
    modelConfig(cwd, "repairRetries: 2\nescalationThreshold: 2", "repairRetries: 0\nescalationThreshold: 0");
    const { result, calls } = await execute(cwd);
    assert.equal(result.status, "escalated");
    assert.deepEqual(calls.filter((call) => /implementation|repair/.test(call.label)).map((call) => call.label), [
      "cheap implementation",
    ]);
  });
});

test("repairRetries one escalates the only retry to the stronger model", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  dynamic:",
      "    command: " + JSON.stringify(`node -e "process.exit(require('fs').existsSync('passed.flag') ? 0 : 1)"`),
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [dynamic]", "",
    ].join("\n"));
    modelConfig(cwd, "repairRetries: 2\nescalationThreshold: 2", "repairRetries: 1\nescalationThreshold: 1");
    const { result, calls } = await execute(cwd, { repairAt: 2 });
    assert.equal(result.status, "implemented");
    assert.deepEqual(calls.filter((call) => /implementation|repair/.test(call.label)).map((call) => call.label), [
      "cheap implementation", "strong implementation",
    ]);
  });
});

test("reviewRetries zero ends after the first independent rejection", async () => {
  await project(async (cwd) => {
    modelConfig(cwd, "reviewRetries: 2", "reviewRetries: 0");
    const { result, calls } = await execute(cwd, { reviewerRejections: 1 });
    assert.equal(result.status, "escalated");
    assert.equal(result.reviewRounds, 1);
    assert.equal(calls.filter((call) => call.label === "independent review").length, 1);
  });
});

test("reviewRetries one permits a second round after a rejection", async () => {
  await project(async (cwd) => {
    modelConfig(cwd, "reviewRetries: 2", "reviewRetries: 1");
    const { result, calls } = await execute(cwd, { reviewerRejections: 1 });
    assert.equal(result.status, "implemented");
    assert.equal(result.reviewRounds, 2);
    assert.equal(calls.filter((call) => call.label === "independent review").length, 2);
  });
});

test("escalationThreshold one switches to the stronger model on the first repair", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  dynamic:",
      "    command: " + JSON.stringify(`node -e "process.exit(require('fs').existsSync('passed.flag') ? 0 : 1)"`),
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [dynamic]", "",
    ].join("\n"));
    modelConfig(cwd, "escalationThreshold: 2", "escalationThreshold: 1");
    const { result, calls } = await execute(cwd, { repairAt: 2 });
    assert.equal(result.status, "implemented");
    const implementations = calls.filter((call) => /implementation|repair/.test(call.label));
    assert.deepEqual(implementations.map((call) => call.label), ["cheap implementation", "strong implementation"]);
    assert.ok(implementations[1].modelPattern?.includes("gpt"));
  });
});

test("escalationThreshold keeps later retries on the stronger model", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  dynamic:",
      "    command: " + JSON.stringify(`node -e "process.exit(require('fs').existsSync('passed.flag') ? 0 : 1)"`),
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [dynamic]", "",
    ].join("\n"));
    modelConfig(cwd, "repairRetries: 2", "repairRetries: 3");
    modelConfig(cwd, "escalationThreshold: 2", "escalationThreshold: 1");
    const { result, calls } = await execute(cwd, { repairAt: 4 });
    assert.equal(result.status, "implemented");
    assert.deepEqual(calls.filter((call) => /implementation|repair/.test(call.label)).map((call) => call.label),
      ["cheap implementation", "strong implementation", "strong implementation", "strong implementation"]);
  });
});

test("omitting escalationThreshold preserves last-retry escalation", async () => {
  await project(async (cwd) => {
    fs.writeFileSync(path.join(cwd, ".agentctl/checks.yaml"), [
      "checks:", "  dynamic:",
      "    command: " + JSON.stringify(`node -e "process.exit(require('fs').existsSync('passed.flag') ? 0 : 1)"`),
      "    timeoutSeconds: 10", "profiles:", "  scaffold: [dynamic]", "",
    ].join("\n"));
    modelConfig(cwd, "escalationThreshold: 2\n", "");
    const { result, calls } = await execute(cwd, { repairAt: 3 });
    assert.equal(result.status, "implemented");
    assert.deepEqual(calls.filter((call) => /implementation|repair/.test(call.label)).map((call) => call.label),
      ["cheap implementation", "cheap repair", "strong implementation"]);
  });
});

test("rejects thresholds outside the configured repair budget", async () => {
  for (const threshold of ["0", "3", "-1", "1.5", "invalid"]) {
    await project(async (cwd) => {
      modelConfig(cwd, "escalationThreshold: 2", "escalationThreshold: " + threshold);
      await assert.rejects(execute(cwd), /escalationThreshold/);
      assert.equal(cli(cwd, ["work", "list", "--json"]).includes('"in-progress"'), false);
    });
  }
});
