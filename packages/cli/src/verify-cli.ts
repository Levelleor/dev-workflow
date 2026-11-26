import { flag } from "./cli-arguments.js";
import type { CommandDefinition } from "./cli-command.js";
import { addGate, listGates, verify } from "./verify.js";

export const verifyCommand: CommandDefinition = {
  name: "verify",
  summary: "Run, list, or register verification gates.",
  syntax: "[GATE | --profile NAME] [--json]",
  details: [
    "Omit GATE to run all registered gates in name order.",
    "Use --profile NAME to run a configured profile. Missing and empty profiles fail.",
    "Exit status is 0 when all selected checks pass and 1 on failure.",
  ].join("\n"),
  run({ args, flags, fs, root, runner, json, emit, output, usage }) {
    const [gate] = args;
    const profile = flag(flags, "profile");
    if (args.length > 1 || (gate && profile)) throw new Error(`Usage: ${usage}`);
    const result = verify(fs, root, profile ?? gate ?? "all", runner, profile ? "profile" : "gate");
    if (json) emit(result);
    else for (const check of result.checks) {
      output(`[${check.passed ? "PASS" : "FAIL"}] ${check.name} (${check.durationMs}ms)`);
      if (check.stdout) output(check.stdout);
      if (check.stderr) output(check.stderr);
    }
    return result.passed ? 0 : 1;
  },
  children: [
    {
      name: "list",
      summary: "List registered gates, commands, and timeouts.",
      syntax: "[--json]",
      run({ args, fs, root, json, emit, usage }) {
        if (args.length) throw new Error(`Usage: ${usage}`);
        const gates = listGates(fs, root);
        emit(json ? gates : gates.map((gate) =>
          `${gate.name}: ${gate.command} (${gate.timeoutSeconds}s)`).join("\n") || "No gates registered.");
        return 0;
      },
    },
    {
      name: "add",
      summary: "Register a shell command as a new verification gate.",
      syntax: "<GATE> [--timeout SECONDS] [--json] -- COMMAND [args...]",
      details: [
        "Use -- before the command to preserve its arguments and options.",
        "The timeout defaults to 120 seconds. Existing gates cannot be overwritten.",
        "",
        "Example: agentctl verify add docs --timeout 120 -- npm run lint:docs",
      ].join("\n"),
      forwardsArguments: true,
      run({ args, forwardedArgs, flags, fs, root, json, emit, usage }) {
        if (args.length !== 1 || !forwardedArgs.length) throw new Error(`Usage: ${usage}`);
        const rawTimeout = flag(flags, "timeout");
        if (Object.hasOwn(flags, "timeout") && rawTimeout === undefined) {
          throw new Error("Use --timeout with a positive integer in seconds.");
        }
        const timeout = rawTimeout === undefined ? 120 : Number(rawTimeout);
        // Preserve argument boundaries when the shell executes this configured command.
        const quoted = forwardedArgs.map((word) =>
          /^[a-zA-Z0-9_./:@=+,\\-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`);
        const gate = addGate(fs, root, args[0], quoted.join(" "), timeout);
        emit(json ? gate : `Added gate ${gate.name}: ${gate.command}`);
        return 0;
      },
    },
  ],
};
