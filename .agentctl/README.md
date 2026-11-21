# dev-workflow self-hosted configuration

This directory describes how dev-workflow **will manage itself** once its CLI and Ultracode adapter exist.

- [`project.yaml`](project.yaml): repository identity, knowledge roots and baseline execution mode.
- [`models.yaml`](models.yaml): intended role-to-model policy and resource limits (not yet validated against providers).
- [`checks.yaml`](checks.yaml): desired trusted verification profiles, not an implemented verifier.

Application-coupled documentation lives under `docs/`; local journals and private artifacts will live in Git-ignored `.agentctl/runtime/`. Avoid committing generated indices until an indexing design is agreed.

These files are **proposed configuration contracts**. No agent should infer that setting a value here automatically enforces it today.
