# Knowledge record conventions

## Canonical records and discovery

Every active PRD, ADR, work item or workflow document must have YAML frontmatter containing a stable `id`, `type`, `status` and relationship fields where applicable. IDs must not change when files are renamed.

Each record must be linked from its category index (until a generated index exists) and from its parent when appropriate. Cross-record IDs in `related`, `depends_on`, `parent` and `supersedes` must resolve. Use a canonical file per record; backlinks can eventually be generated instead of duplicated manually.

## Where new information goes

- Product intent → `docs/product/`.
- Architecture and design → `docs/architecture/`.
- Durable architectural decision → `docs/decisions/` as ADR.
- Feature, bug or task → `docs/work/items/`.
- Active execution plan → `docs/work/plans/`.
- Material whose classification is unclear → `docs/knowledge/inbox/` with originating task and source.

Do not invent a new top-level taxonomy for one document. If genuinely necessary, propose a structure change and update indexes. When uncertain, capture an item in the inbox instead of asking for trivial filename decisions; ask for review when product intent, security or architecture would change.

## Lifecycle

Stories: `pending` → `in-progress` → `implemented`; a subsequent verification/integration gate may mark them `accepted`. Proposed stories are not claimable. In the sequential POC, implemented/completed/accepted dependencies count as resolved. Knowledge records retain their own proposed/accepted/superseded lifecycle. Implementation is not acceptance.

Archive completed plans or obsolete notes with traceable IDs; supersede ADRs rather than erasing rationale. Avoid duplicative documents that merely restate existing canonical records.

## Initial implementation status

These are documented conventions. The CLI now allocates IDs for PRDs, ADRs, stories and inbox notes, validates references supplied during creation, and appends category-index links. Repository-wide link linting, generated reverse indexes, merge-conflict reconciliation and session context retrieval are **not yet implemented**. See [templates](../../templates/records/README.md).

## Verification gates and task-local notes

Executable verification gates live in `.agentctl/checks.yaml`, managed by `agentctl verify list|add` and run by `agentctl verify`. Adding a gate is a repository change subject to review. Gate failures are not acceptance receipts.

Task-specific notes belong directly in the story's `## Notes` section, managed through `agentctl task [ID] notes`; they are automatically included in task context. The inbox remains for discoveries that need broader classification.
