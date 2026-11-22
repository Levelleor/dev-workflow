# Ultracode orchestration architecture

The first autonomous workflow is an **interactive Pi → saved Ultracode workflow** path. The workflow consumes model selection, optional thinking effort, bounded `repairRetries` and `reviewRetries` from `.agentctl/models.yaml`, and owns independent review and PR publication. When model or thinking is omitted, Ultracode inherits the model or effort from its role/Pi. `agentctl` owns only deterministic task state, context assembly, notes and gate execution.

The trusted Pi extension `pi-ultracode-agentctl-bridge` registers `agentctl.read`, `agentctl.write` and `agentctl.verify` with Ultracode's opt-in host capability event. The extension validates finite JSON operations and invokes the agentctl binary with `execFile`, never spawning a caller-chosen binary or enabling a shell. Project trust, explicit user grants and a durable Ultracode run journal are required. The VM cannot spawn arbitrary subprocesses.

After a claim, the bridge reads context, model policy and baseline gate definitions through one `agentctl task snapshot` command. Gate definitions are reread before verification to detect policy changes. One worker writes in the shared tree. A read-only reviewer uses a fresh session and receives the original requirements plus external verification evidence. Only review approval leads to `agentctl task complete` and a PR-publishing agent. Verification rejects weakened baseline gates. A missing PR URL must be treated as a publication blocker rather than success.

Implementation: `.pi/ultracode/workflows/agentctl-sequential-feature.workflow.js`; extension: `packages/pi-ultracode-agentctl-bridge/src/bridge.ts`; tests: `packages/pi-ultracode-agentctl-bridge/test/` and `tests/pi-integration.test.ts`.
