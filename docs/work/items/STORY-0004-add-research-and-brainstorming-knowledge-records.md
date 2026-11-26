---
id: STORY-0004
type: story
status: implemented
created_at: 2026-11-26
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Add research and brainstorming knowledge records

## Outcome

Preserve research and explored ideas as searchable knowledge alongside architectural decisions.

## Acceptance criteria

- Create research and brainstorming drafts in dedicated directories with stable IDs, useful headings and index entries.
- Find both types through existing knowledge reads and link related records when creating an ADR.
- Keep research and brainstorming available as optional references in task context.

## Verification plan

Exercise creation, discovery and task context in the CLI tests. Run `npm run check` and `agentctl verify`.
