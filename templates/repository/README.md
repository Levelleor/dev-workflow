# Minimal installation template

This directory contains the files the CLI can offer to install into another repository:

- `AGENTS.md` for agent navigation.
- `.agentctl/project.yaml` for project discovery and task-context document paths.
- `.agentctl/checks.yaml` for initially unconfigured verification profiles.
- `.agentctl/models.yaml` for optional model/thinking choices and retry budgets.

Existing repositories must be inspected first. Merge or propose changes when a target file already exists; never overwrite silently.

No assumption is made about the target repository's language, package manager or test framework. The CLI installs these templates but does not auto-detect or provision a working test suite.
