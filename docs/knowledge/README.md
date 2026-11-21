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

Proposed → approved/ready → completed or superseded (depending on type). Work completion is distinct from external verification and integration; workers cannot mark themselves accepted.

Archive completed plans or obsolete notes with traceable IDs; supersede ADRs rather than erasing rationale. Avoid duplicative documents that merely restate existing canonical records.

## Initial implementation status

These are documented conventions. Automatic ID allocation, link validation, generated indexes, conflict resolution and context retrieval are **not implemented**. See [templates](../../templates/records/README.md).
