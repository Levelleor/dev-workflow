# dev-workflow self-hosted configuration

This directory describes how dev-workflow **will manage itself** once its CLI and Ultracode adapter exist.

- [`project.yaml`](project.yaml): repository identity, knowledge roots and baseline execution mode.
- [`checks.yaml`](checks.yaml): desired trusted verification profiles, not an implemented verifier.

Application-coupled documentation lives under `docs/`; local journals and private artifacts will live in Git-ignored `.agentctl/runtime/`. Avoid committing generated indices until an indexing design is agreed.

The CLI reads project and verification configuration. Model selection, optional thinking effort, and retry budgets belong to the saved Ultracode workflow and Pi, not agentctl.
