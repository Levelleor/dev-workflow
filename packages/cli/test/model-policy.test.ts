import { describe, expect, it } from "vitest";
import { loadWorkflowModels } from "../src/model-policy.js";
import { fixture } from "./fixtures.js";

describe("model policy snapshots", () => {
  it("reads role models, optional thinking levels and configured retry budgets", () => {
    const { fs, initialize } = fixture();
    initialize();
    expect(loadWorkflowModels(fs, "/repo")).toEqual({
      roles: { worker: { model: "deepseek/flash", thinking: "medium" } },
      repairRetries: 2,
      reviewRetries: 2,
    });
  });

  it("preserves missing model and thinking fields for Pi to resolve", () => {
    const { fs, initialize } = fixture();
    initialize();
    fs.writeFileSync("/repo/.agentctl/models.yaml", [
      "roles:", "  worker: {}",
      "  architect:", "    thinking: high",
      "  reviewer:", "    model: anthropic/sonnet",
      "",
    ].join("\n"));
    expect(loadWorkflowModels(fs, "/repo")).toEqual({
      roles: {
        worker: {},
        architect: { thinking: "high" },
        reviewer: { model: "anthropic/sonnet" },
      },
      repairRetries: 2,
      reviewRetries: 2,
    });
  });

  it("fails closed on invalid retry counts and malformed model or thinking types", () => {
    const { fs, initialize } = fixture();
    initialize();
    for (const invalid of [
      "roles:\n  worker: {}\nrepairRetries: -1\n",
      "roles:\n  worker: {}\nreviewRetries: 11\n",
      "roles:\n  worker: {}\nrepairRetries: 1.5\n",
      "roles:\n  worker:\n    model: 123\n",
      "roles:\n  worker:\n    thinking: not_a_level\n",
      "roles: []\n",
    ]) {
      fs.writeFileSync("/repo/.agentctl/models.yaml", invalid);
      expect(() => loadWorkflowModels(fs, "/repo")).toThrow();
    }
  });
});
