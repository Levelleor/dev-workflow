/** @import {} from "pi-ultracode/workflow" */
/**
 * Run from Pi with the saved workflow tool:
 *   workflow({ name: "agentctl-sequential-feature", args: { taskId: "next" } })
 *
 * Host operations run without agent involvement through the installed bridge.
 * Review approval is the only path to task completion and PR publication.
 */
export const meta = {
  name: "agentctl-sequential-feature",
  description: "Claim, implement, verify, repair, review and publish one story",
  hostCapabilities: ["agentctl.read", "agentctl.write", "agentctl.verify"],
  phases: [
    { title: "Claim" },
    { title: "Implement" },
    { title: "Verify" },
    { title: "Review" },
    { title: "Publish" },
  ],
};

const RESULT = {
  type: "object",
  properties: {
    completed: { type: "boolean" },
    summary: { type: "string" },
    blockers: { type: "array", items: { type: "string" } },
  },
  required: ["completed", "summary"],
  additionalProperties: false,
};
const REVIEW = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    summary: { type: "string" },
    findings: { type: "array", items: { type: "string" } },
  },
  required: ["approved", "summary", "findings"],
  additionalProperties: false,
};

const settings = await hostCall("agentctl.read", { op: "models" });
const roles = settings.value.models.roles;
const cheapModel = roles.worker.model;
const strongModel = roles.architect.model;
const reviewerModel = roles.reviewer.model;

phase("Claim");
const requested = args && args.taskId ? args.taskId : "next";
const claim = await hostCall("agentctl.write", { op: "claim", id: requested });
if (claim.exitCode !== 0) {
  log("No claim: " + JSON.stringify(claim.value));
  return { status: "unavailable", reason: claim.value };
}
const task = claim.value.context.task;
const assignment = claim.value.context.prompt;
const id = task.id;
const originalGatesResult = await hostCall("agentctl.read", { op: "gates" });
const originalGates = originalGatesResult.value;

const lookup = await agent(
  "Read the supplied claimed story and give a short implementation map: likely source paths, risks and acceptance criteria. " +
  "Do not modify files and do not claim another task. The claim has already been performed deterministically. " +
  "Task context:\n" + assignment,
  { label: "cheap task lookup", phase: "Claim", model: cheapModel, agentType: "Explore" },
);
if (!lookup) {
  return { status: "escalated", id, reason: "Task lookup agent failed", reviewRounds: 0 };
}

// A fresh implementation agent receives the complete, authoritative context on boot.
let feedback = "Initial implementation. Lookup notes:\n" + lookup;
let reviewRounds = 0;
let verified = null;
let latestImplementation = null;

while (reviewRounds < 3) {
  reviewRounds++;
  phase("Implement");
  let model = cheapModel;
  let repairAttempt = 0;
  let passed = false;

  // One initial cheap attempt, one cheap repair, then one stronger attempt.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 2) model = strongModel;
    const prompt =
      "Implement exactly story " + id + ". You own implementation and tests, but NEVER mark the task implemented " +
      "and NEVER create a pull request. You may register necessary new verification gates using agentctl verify add, " +
      "and leave task notes. Preserve all existing gates. Report actual changes and remaining blockers. " +
      "Run targeted tests as needed; a separate trusted gate run determines pass/fail.\n\n" +
      "Task context:\n" + assignment + "\n\nFeedback:\n" + feedback +
      "\nAttempt: " + (attempt + 1) + " of 3 in review round " + reviewRounds + ".";
    const implementation = await agent(prompt, {
      label: attempt === 2 ? "strong implementation" : attempt === 1 ? "cheap repair" : "cheap implementation",
      phase: "Implement",
      model,
      agentType: "agentctl-implementer",
      schema: RESULT,
    });
    latestImplementation = implementation;
    if (!implementation) {
      feedback = "Worker failed or produced no structured result. Inspect the repository and previous work.";
    } else {
      feedback = implementation.summary +
        "\nReported blockers: " + JSON.stringify(implementation.blockers || []);
    }

    // Every gate runs deterministically, regardless of the implementation agent's claim.
    phase("Verify");
    const currentGatesResult = await hostCall("agentctl.read", { op: "gates" });
    const currentGates = currentGatesResult.value;
    let policyValid = true;
    for (const original of originalGates) {
      const current = currentGates.find((entry) => entry.name === original.name);
      if (!current || current.command !== original.command ||
          current.timeoutSeconds < original.timeoutSeconds || (original.required && !current.required)) {
        policyValid = false;
      }
    }
    if (!policyValid) {
      return { status: "escalated", id, reason: "Verification policy was weakened or removed", reviewRounds };
    }

    verified = await hostCall("agentctl.verify", {});
    if (verified.value.passed && verified.exitCode === 0 && implementation && implementation.completed) {
      passed = true;
      break;
    }
    repairAttempt++;
    feedback = "The implementation is not yet accepted. Previous worker:\n" +
      feedback + "\nVerification output:\n" + JSON.stringify(verified.value) +
      "\nFix every failing check and rerun tests. Do not remove or weaken gates.";
    if (attempt === 1) feedback += "\nYou are being escalated to the stronger implementation model.";
  }

  if (!passed) {
    return {
      status: "escalated", id, reason: "Implementation or verification failed after cheap retry and strong escalation",
      reviewRounds, verification: verified && verified.value, implementation: latestImplementation,
    };
  }

  phase("Review");
  // Independent fresh session: no implementation transcript, only original requirements
  // and externally verified result. Role tools are read-only.
  const verdict = await agent(
    "Independently review story " + id + " in the working tree. Do not edit code or task state. " +
    "Validate every acceptance criterion, test coverage, regressions, code quality, security and edge cases. " +
    "Return approved:true ONLY when there are no material findings. " +
    "Requirements:\n" + assignment +
    "\nVerification evidence:\n" + JSON.stringify(verified.value),
    { label: "independent review", phase: "Review", model: reviewerModel,
      agentType: "agentctl-reviewer", schema: REVIEW },
  );
  if (!verdict || !verdict.approved) {
    const reason = verdict ? verdict.summary + "\n" + verdict.findings.join("\n") : "Reviewer failed to return a verdict.";
    await hostCall("agentctl.write", { op: "note-add", id, text: ("Review round " + reviewRounds + ": " + reason).slice(0, 3900) });
    if (reviewRounds === 3) {
      return { status: "escalated", id, reason: "Rejected at the maximum of three review rounds",
        reviewRounds, findings: verdict ? verdict.findings : ["No valid verdict"], verification: verified.value };
    }
    feedback = "Independent reviewer rejected the current implementation. Address these exact findings:\n" +
      reason + "\nThe original requirements and all verification gates still apply.";
    continue;
  }

  // Verify one last time after review, before changing task state.
  const finalGatesResult = await hostCall("agentctl.read", { op: "gates" });
  let changed = false;
  for (const baseline of originalGates) {
    const current = finalGatesResult.value.find((g) => g.name === baseline.name);
    if (!current || current.command !== baseline.command ||
        current.timeoutSeconds < baseline.timeoutSeconds || (baseline.required && !current.required)) changed = true;
  }
  if (changed) {
    return { status: "escalated", id, reason: "Verification gate changed during review", reviewRounds };
  }
  const finalCheck = await hostCall("agentctl.verify", {});
  if (!finalCheck.value.passed || finalCheck.exitCode !== 0) {
    feedback = "Final verification failed after reviewer approval: " + JSON.stringify(finalCheck.value);
    if (reviewRounds === 3) {
      return { status: "escalated", id, reason: feedback, reviewRounds };
    }
    continue;
  }

  phase("Publish");
  await hostCall("agentctl.write", { op: "note-add", id,
    text: ("Review accepted in round " + reviewRounds + ": " + verdict.summary).slice(0, 3900) });
  await hostCall("agentctl.write", { op: "complete", id });

  // PR creation requires repository credentials and must not be an arbitrary host shell command.
  // Use a dedicated publisher agent, with no permission to change code or verification policy.
  const published = await agent(
    "Publish the ALREADY ACCEPTED implementation for " + id + " as a GitHub pull request. " +
    "Do not alter code, checks, task status or requirements. Create a dedicated feature branch if necessary, " +
    "commit the accepted work, push it and open a PR targeting the repository's default branch. " +
    "Use the repository's existing git/gh capabilities and return the exact PR URL. " +
    "If publishing is unavailable, report the blocker without changing anything. " +
    "Reviewer approval:\n" + verdict.summary +
    "\nVerification:\n" + JSON.stringify(finalCheck.value),
    { label: "publish accepted PR", phase: "Publish", model: reviewerModel,
      agentType: "agentctl-publisher", schema: RESULT },
  );
  if (!published || !published.completed) {
    return { status: "publish-blocked", id, reason: published ? published.summary : "PR publisher failed",
      reviewRounds, verified: true };
  }
  return { status: "implemented", id, reviewRounds, review: verdict.summary,
    publication: published.summary, verified: true };
}
return { status: "escalated", id, reason: "Review loop exhausted", reviewRounds };
