# dev-workflow self-hosted configuration

This directory describes how dev-workflow **will manage itself** once its CLI and Ultracode adapter exist.

- [`project.yaml`](project.yaml): repository identity, knowledge roots and baseline execution mode.
- [`models.yaml`](models.yaml): workflow role models, optional thinking levels and retry budgets.
- [`checks.yaml`](checks.yaml): desired trusted verification profiles, not an implemented verifier.

Application-coupled documentation lives under `docs/`; local journals and private artifacts will live in Git-ignored `.agentctl/runtime/`. Avoid committing generated indices until an indexing design is agreed.

The CLI validates and exposes `models.yaml` through `agentctl task snapshot`. The Ultracode workflow consumes those settings, while Pi/Ultracode resolves models and thinking levels. No `limits.*` fields are used.
