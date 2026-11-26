---
id: STORY-0007
type: story
status: implemented
created_at: 2026-11-26
parent: PRD-0001
depends_on:
  - STORY-0006
priority: 3
related: []
---

# Give each agentctl command its own usage and help

## Outcome

Users can request usage for any command or subcommand through the same help interface.

## Acceptance criteria

- Define each command and subcommand with its own execution handler and help.
- Route -h, --help, and the help command through the same command hierarchy without loading a project.
- Generate the top-level command listing from those definitions and retain detailed record usage.
- Preserve existing execution behavior, including task IDs and verification gate arguments.

## Verification plan

Test help routing and existing command behavior with npm run check and registered gates.

## Notes

### N001
Help and execution now share one command tree. Task notes declare the optional ID before the command name, and verify add declares ownership of arguments after the option delimiter, so the resolver handles both for help and execution.
