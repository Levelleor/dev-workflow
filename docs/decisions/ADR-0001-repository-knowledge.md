---
id: ADR-0001
type: adr
status: accepted
related:
  - PRD-0001
supersedes: []
---

# ADR-0001: Repository-backed knowledge initially

## Context

External knowledge services would increase dependencies and initial implementation cost. Product specifications, work definitions and architectural decisions should remain portable with their source repository.

## Decision

Use versioned Markdown with typed frontmatter, stable IDs and explicit links in the repository for the initial milestone. Maintain a discoverable root index and lintable references. Ignore private runtime state and avoid pretending Git supplies atomic concurrent task claims.

## Consequences

Sequential development simplifies the first POC. Later parallel writers require integration-time conflict handling and revision checks. Revisit storage if multi-host scheduling or external integrations become requirements.
