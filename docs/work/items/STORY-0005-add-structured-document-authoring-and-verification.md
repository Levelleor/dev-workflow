---
id: STORY-0005
type: story
status: implemented
created_at: 2026-11-26
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Add structured document authoring and verification

## Outcome

Agents can create complete stories and knowledge records through named sections, with actionable errors for invalid document structure and references.

## Acceptance criteria

- Creation help lists each record type's sections and shows inline, file, and stdin input.
- The CLI renders section headings, validates supplied relationships and local Markdown links, and rejects invalid additions before saving.
- Doctor and the docs verification gate report invalid frontmatter, broken local references, and malformed task notes after direct edits.

## Verification plan

Exercise help and section input with CLI tests. Cover broken dependencies, local links, and malformed notes with document validation tests. Run `npm run check` and `agentctl verify`.

## Notes

### N001
ADR-0002 already links to FLOW-001 in workflows/. Document verification indexes workflow IDs, and task context can return these as optional references.
