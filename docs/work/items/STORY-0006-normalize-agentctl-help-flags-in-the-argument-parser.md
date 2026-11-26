---
id: STORY-0006
type: story
status: implemented
created_at: 2026-11-26
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Normalize agentctl help flags in the argument parser

## Outcome

Both help spellings use the same argument parser and command help.

## Acceptance criteria

- Treat -h as an alias of --help across the CLI.
- Show the existing help for each command before loading the project.
- Preserve help flags passed to commands after the verify add delimiter.

## Verification plan

Exercise both aliases, command help, and verify add argument forwarding. Run npm run check.

## Notes

### N001
The CLI now resolves aliases before parsing options and treats -- as the end of options. verify add detects its command from parsed positionals so leading CLI flags cannot expose the registered command arguments to the help handler.
