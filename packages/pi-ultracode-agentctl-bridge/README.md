# pi-ultracode-agentctl-bridge

Pi extension providing **only** `agentctl.read`, `agentctl.write` and `agentctl.verify` host capabilities to the [pi-ultracode host-capabilities PR](https://github.com/Levelleor/pi-ultracode/pull/1).

The workflow VM never receives Node APIs or arbitrary commands. The extension constructs fixed, validated agentctl CLI arguments and launches only the compiled agentctl entry point using `execFile(process.execPath, ..., {shell:false})`. Arbitrary executable names, raw argv, paths, shell snippets or flags cannot be passed to the bridge. Gate execution *does* execute commands configured in the trusted repository's verification policy, deliberately and as a write-effect capability.

## Installation and grants

1. Install the pi-ultracode fork at the tested host-capability revision (or merge the upstream PR into the installed extension).
2. Build this monorepo: `npm ci && npm run build`.
3. Load both extensions in Pi: the Ultracode extension and `packages/runtime-ultracode/dist/bridge.js` (or install this package through Pi).
4. In the **user's home directory**, grant exactly these capabilities in `~/.pi/ultracode/host-capabilities.json`:

```json
{ "allow": ["agentctl.read", "agentctl.write", "agentctl.verify"] }
```

5. Trust the project in Pi. The project itself cannot grant these capabilities.
6. In Pi, invoke the saved `agentctl-sequential-feature` workflow with `{ "taskId": "next" }`, or a stable `STORY-0001` ID.

## Capability contract

- `agentctl.read`: task list, context, task snapshot (context, baseline gates and `.agentctl/models.yaml` policy in one CLI call), notes and gate list.
- `agentctl.write`: claim specific/next task, mark implemented, add/remove task notes.
- `agentctl.verify`: all verification gates or one named gate.

Mutating operations are versioned, user-granted, and journalled by Ultracode for safe replay. An interrupted mutating call must be reconciled before restarting a run. Do not treat a subprocess exit code as permission to execute any other command.

The workflow is at `.pi/ultracode/workflows/agentctl-sequential-feature.workflow.js`. The workflow reads model and optional thinking effort settings plus retry budgets from the batched `agentctl.read` snapshot. Those settings are defined in `.agentctl/models.yaml`, while Pi/Ultracode resolves model selection and thinking. Omitting a model or thinking level delegates to Pi or the selected Ultracode role. A real GitHub PR requires the publisher role to have a valid `git` remote and authenticated `gh` CLI. Without these, the workflow reports a publication blocker and leaves the task implemented, not silently accepted as published.
