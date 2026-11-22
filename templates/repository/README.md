# Minimal installation template

This directory contains the files the CLI can offer to install into another repository:

- `AGENTS.md` for agent navigation.
- `.agentctl/project.yaml` for project-level storage and orchestration intent.
- `.agentctl/checks.yaml` for initially unconfigured verification profiles.

Existing repositories must be inspected first. Merge or propose changes when a target file already exists; never overwrite silently.

No assumption is made about the target repository's language, package manager or test framework. The CLI installs these templates but does not auto-detect or provision a working test suite.
