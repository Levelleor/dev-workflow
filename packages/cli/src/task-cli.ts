import type { Flags } from "./cli-arguments.js";
import type { CommandDefinition } from "./cli-command.js";
import { addTaskNote, listTaskNotes, removeTaskNote } from "./task-notes.js";
import { claimTask, completeTask, getActiveTaskContext } from "./task.js";

function requirePositionalId(flags: Flags): void {
  if (Object.hasOwn(flags, "id")) throw new Error("Use positional task IDs, e.g. 'agentctl task claim STORY-0001'.");
}

const noteTarget = "Omit ID to use the active task, or place a stable ID before notes to address a specific story.";

const notes: CommandDefinition = {
  name: "notes",
  leadingArgument: "ID",
  summary: "Manage notes stored in a story's Markdown.",
  details: [
    noteTarget,
    "Example: agentctl task STORY-0001 notes add \"Review timeout behavior\"",
  ].join("\n"),
  children: [
    {
      name: "add",
      summary: "Add a note to a story.",
      syntax: '"TEXT" [--json]',
      details: noteTarget,
      run({ args, leadingArgs, fs, root, json, emit, usage }) {
        if (args.length !== 1) throw new Error(`Usage: ${usage}`);
        const note = addTaskNote(fs, root, args[0], leadingArgs[0]);
        emit(json ? note : `Added ${note.id}: ${note.text}`);
        return 0;
      },
    },
    {
      name: "list",
      summary: "List a story's notes and their IDs.",
      syntax: "[--json]",
      details: noteTarget,
      run({ args, leadingArgs, fs, root, json, emit, usage }) {
        if (args.length) throw new Error(`Usage: ${usage}`);
        const result = listTaskNotes(fs, root, leadingArgs[0]);
        emit(json ? result : result.notes.map((note) => `${note.id}: ${note.text}`).join("\n") || "No notes.");
        return 0;
      },
    },
    {
      name: "remove",
      summary: "Remove a note by its ID, such as N001.",
      syntax: "NOTE-ID [--json]",
      details: noteTarget,
      run({ args, leadingArgs, fs, root, json, emit, usage }) {
        if (args.length !== 1) throw new Error(`Usage: ${usage}`);
        const note = removeTaskNote(fs, root, args[0], leadingArgs[0]);
        emit(json ? note : `Removed ${note.id}.`);
        return 0;
      },
    },
  ],
};

export const taskCommand: CommandDefinition = {
  name: "task",
  summary: "Claim work, get task context, mark implementation complete, or manage notes.",
  details: [
    "Use positional task IDs in STORY-0001 format.",
    "Task lifecycle: pending or ready → in-progress → implemented (all gates pass). Independent review and acceptance are separate.",
    "Only one task can be in progress per working tree.",
  ].join("\n"),
  children: [
    notes,
    {
      name: "claim",
      summary: "Claim a task and return its ID and status.",
      syntax: "<ID|next> [--json]",
      details: [
        "Use next to select by priority from 1 to 5 (1 is highest, 3 is the default), then by stable ID.",
        "An explicit ID bypasses priority. Dependencies must be implemented, completed, or accepted.",
        "Proposed tasks cannot be claimed. An unavailable claim exits with status 2 and explains the blockers.",
        "After claiming, use agentctl task getcontext to read the implementation context.",
        "",
        "Example: agentctl task claim next",
      ].join("\n"),
      run({ args, flags, fs, root, json, emit, usage }) {
        requirePositionalId(flags);
        if (args.length !== 1) throw new Error(`Usage: ${usage}`);
        const result = claimTask(fs, root, args[0]);
        if (!result.ok) {
          emit(json ? result : [result.message, ...result.blocked.map((task) => `${task.id}: ${task.reasons.join("; ")}`)].join("\n"));
          return 2;
        }
        emit(json ? result : `Claimed ${result.task.id}: ${result.task.title} (in-progress). Run 'agentctl task getcontext ${result.task.id}' for context.`);
        return 0;
      },
    },
    {
      name: "getcontext",
      summary: "Read the implementation context for an in-progress task.",
      syntax: "[ID] [--json]",
      details: "Omit ID to use the active task. JSON output includes both the assembled prompt and structured task context.",
      run({ args, flags, fs, root, json, emit, usage }) {
        requirePositionalId(flags);
        if (args.length > 1) throw new Error(`Usage: ${usage}`);
        const context = getActiveTaskContext(fs, root, args[0]);
        emit(json ? context : context.prompt);
        return 0;
      },
    },
    {
      name: "complete",
      summary: "Run all verification gates and mark an in-progress task implemented only if they pass.",
      syntax: "[ID] [--json]",
      details: "Omit ID to use the active task. All registered gates must pass; failures leave the task in progress and exit 1. Independent review and acceptance are separate.",
      run({ args, flags, fs, root, runner, json, emit, output, usage }) {
        requirePositionalId(flags);
        if (args.length > 1) throw new Error(`Usage: ${usage}`);
        const result = completeTask(fs, root, args[0], runner);
        if (json) emit(result);
        else {
          for (const check of result.verification?.checks ?? []) {
            output(`[${check.passed ? "PASS" : "FAIL"}] ${check.name} (${check.durationMs}ms)`);
            if (check.stdout) output(check.stdout);
            if (check.stderr) output(check.stderr);
          }
          emit(result.ok
            ? `${result.id} marked implemented. All verification gates passed; independent review and acceptance are separate.`
            : `Completion rejected for ${result.id}: ${result.message}`);
        }
        return result.ok ? 0 : 1;
      },
    },
  ],
};
