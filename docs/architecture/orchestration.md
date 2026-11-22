# Ultracode orchestration architecture

The first autonomous workflow is an **interactive Pi → saved Ultracode workflow** path. The workflow itself owns agent selection, bounded retries, independent review and PR publication. `agentctl` owns only deterministic task state, context assembly, notes and gate execution.

The trusted Pi extension `pi-ultracode-agentctl-bridge` registers `agentctl.read`, `agentctl.write` and `agentctl.verify` with Ultracode's opt-in host capability event. The extension validates finite JSON operations and invokes the agentctl binary with `execFile`, never spawning a caller-chosen binary or enabling a shell. Project trust, explicit user grants and a durable Ultracode run journal are required. The VM cannot spawn arbitrary subprocesses.

One worker writes in the shared tree. A read-only reviewer uses a fresh session and receives the original requirements plus external verification evidence. Only review approval leads to `agentctl task complete` and a PR-publishing agent. Verification rejects weakened baseline gates. A missing PR URL must be treated as a publication blocker rather than success.

Implementation: `.pi/ultracode/workflows/agentctl-sequential-feature.workflow.js`; extension: `packages/runtime-ultracode/src/bridge.ts`; tests: `packages/runtime-ultracode/test/` and `tests/pi-integration.test.ts`.
