---
id: STORY-0003
type: story
status: implemented
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Add agent-friendly record search and filters

## Outcome

Let agents find and read repository records with compact CLI output and no frontmatter parsing.

## Acceptance criteria

- Search titles and bodies with ranked excerpts, composable metadata filters, and a result limit.
- Query story dependencies in either direction and inspect current blockers using the task claimer's rules.
- Select result fields or read a full Markdown body. Provide command-specific help and usage examples.

## Verification plan

Cover lookup behavior and compatibility in the CLI tests. Run `npm run check` and `agentctl verify`.

## Notes

### N001
The scaffold verification gate already runs the CLI Vitest suite and discovers the lookup regression tests. Date filters use explicit frontmatter dates, so existing undated records can still be listed and searched without a date filter.
