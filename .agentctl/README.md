# dev-workflow self-hosted configuration

This directory describes how dev-workflow **will manage itself** once its CLI and Ultracode adapter exist.

- [`project.yaml`](project.yaml): project-root marker and required/optional task-context documents.
- [`models.yaml`](models.yaml): workflow role models, optional thinking levels and retry budgets.
- [`checks.yaml`](checks.yaml): desired trusted verification profiles, not an implemented verifier.

Application-coupled documentation lives under `docs/`; local journals and private artifacts will live in Git-ignored `.agentctl/runtime/`. Avoid committing generated indices until an indexing design is agreed.

The CLI exposes `models.yaml` through `agentctl config show --json`. The Ultracode workflow reads the role models, optional thinking levels and retry budgets in one settings call, while task context and verification gates are fetched independently. No `limits.*` fields are used.
