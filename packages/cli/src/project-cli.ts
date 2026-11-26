import { join, resolve } from "node:path";
import { requireArg } from "./cli-arguments.js";
import type { CommandDefinition } from "./cli-command.js";
import { getSetting, setSetting, showConfig } from "./config.js";
import { formatDiagnostic } from "./document-links.js";
import { lintDocuments } from "./documents.js";
import { initProject, readYaml } from "./project.js";
import { listRecords } from "./records.js";

export const projectCommands: readonly CommandDefinition[] = [
  {
    name: "init",
    summary: "Install project files in the current or specified directory.",
    syntax: "[DIRECTORY] [--json]",
    details: "Creates missing files and preserves existing files. DIRECTORY can be an absolute path or relative to the current directory.",
    standalone: true,
    run({ args, fs, cwd, templates, emit }) {
      emit(initProject(fs, args[0] ? resolve(cwd, args[0]) : cwd, templates));
      return 0;
    },
  },
  {
    name: "doctor",
    summary: "Inspect project setup and documents.",
    syntax: "[--json]",
    details: "Checks the project manifest, instructions, documents, and verification profiles. Errors return exit status 1.",
    run({ fs, root, emit }) {
      // Validate the manifest without requiring a separate project identity.
      readYaml(fs, join(root, ".agentctl", "project.yaml"));
      const problems: string[] = [];
      const warnings: string[] = [];
      if (!fs.existsSync(join(root, "AGENTS.md"))) problems.push("Missing AGENTS.md");
      problems.push(...lintDocuments(fs, root).map(formatDiagnostic));
      const checks = readYaml(fs, join(root, ".agentctl", "checks.yaml"));
      const profiles = checks.profiles as Record<string, unknown> | undefined;
      for (const [name, value] of Object.entries(profiles ?? {})) {
        if (!Array.isArray(value) || value.length === 0) warnings.push(`Profile '${name}' is not configured`);
      }
      emit({ ok: problems.length === 0, problems, warnings });
      return problems.length ? 1 : 0;
    },
  },
  {
    name: "docs",
    summary: "Check repository documentation.",
    children: [
      {
        name: "lint",
        summary: "Validate document structure and repository links.",
        syntax: "[--json]",
        details: "Checks frontmatter, record relationships, task notes, and local links. Invalid documents return exit status 1.",
        run({ args, fs, root, json, emit, usage }) {
          if (args.length) throw new Error(`Usage: ${usage}`);
          const diagnostics = lintDocuments(fs, root);
          const ok = diagnostics.length === 0;
          emit(json ? { ok, diagnostics } : diagnostics.map(formatDiagnostic).join("\n") || "Documents passed validation.");
          return ok ? 0 : 1;
        },
      },
    ],
  },
  {
    name: "status",
    summary: "Show record totals and the number of active stories.",
    syntax: "[--json]",
    details: "Active stories have a status of pending, ready, or in-progress.",
    run({ fs, root, emit }) {
      const records = listRecords(fs, root);
      emit({
        records: {
          stories: records.filter((record) => record.type === "story").length,
          prds: records.filter((record) => record.type === "prd").length,
          adrs: records.filter((record) => record.type === "adr").length,
          notes: records.filter((record) => record.type === "note").length,
          research: records.filter((record) => record.type === "research").length,
          brainstorms: records.filter((record) => record.type === "brainstorm").length,
        },
        activeStories: records.filter((record) =>
          record.type === "story" && ["pending", "ready", "in-progress"].includes(record.status)).length,
      });
      return 0;
    },
  },
];

export const configCommand: CommandDefinition = {
  name: "config",
  summary: "Inspect and update project settings.",
  children: [
    {
      name: "show",
      summary: "Show the available project, model, and verification settings.",
      syntax: "[--json]",
      run({ fs, root, emit }) {
        emit(showConfig(fs, root));
        return 0;
      },
    },
    {
      name: "get",
      summary: "Read an individual setting by its dotted path.",
      syntax: "KEY [--json]",
      details: "Example: agentctl config get models.roles.worker.model",
      run({ args, fs, root, emit, usage }) {
        emit(getSetting(fs, root, requireArg(args[0], usage)));
        return 0;
      },
    },
    {
      name: "set",
      summary: "Update an existing project or model setting.",
      syntax: "KEY VALUE [--json]",
      details: [
        "Use a dotted key and a scalar YAML value, such as a string, number, or boolean.",
        "Example: agentctl config set models.roles.worker.thinking high",
      ].join("\n"),
      run({ args, fs, root, emit, usage }) {
        const key = requireArg(args[0], usage);
        const value = requireArg(args[1], usage);
        emit({ key, value: setSetting(fs, root, key, value) });
        return 0;
      },
    },
  ],
};
