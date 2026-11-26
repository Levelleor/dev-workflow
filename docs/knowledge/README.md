# Knowledge record conventions

## Canonical records and discovery

Every active PRD, ADR, work item, workflow, research or brainstorming record must have YAML frontmatter containing a stable `id`, `type`, `status` and relationship fields where applicable. IDs must not change when files are renamed.

Each record must be linked from its category index (until a generated index exists) and from its parent when appropriate. Cross-record IDs in `related`, `depends_on`, `parent` and `supersedes` must resolve. Use a canonical file per record; backlinks can eventually be generated instead of duplicated manually.

## Where new information goes

- Product intent → `docs/product/`.
- Architecture and design → `docs/architecture/`.
- Durable architectural decision → `docs/decisions/` as ADR.
- Feature, bug or task → `docs/work/items/`.
- Active execution plan → `docs/work/plans/`.
- Research questions, sources, findings and trade-offs → [research records](research/README.md).
- Brainstormed ideas, reasoning and options set aside → [brainstorming records](brainstorming/README.md).
- Material whose classification is unclear → `docs/knowledge/inbox/` with originating task and source.

Do not invent a new top-level taxonomy for one document. If genuinely necessary, propose a structure change and update indexes. When uncertain, capture an item in the inbox instead of asking for trivial filename decisions; ask for review when product intent, security or architecture would change.

Link research and brainstorming from a resulting ADR using `agentctl knowledge add --type adr --title "Decision title" --related RESEARCH-0001,BRAINSTORM-0001`. Find prior explorations with `agentctl knowledge search "topic"`, optionally using `--type research` or `--type brainstorm`.

## Lifecycle

Stories: `pending` → `in-progress` → `implemented`; a subsequent verification/integration gate may mark them `accepted`. Proposed stories are not claimable. In the sequential POC, implemented/completed/accepted dependencies count as resolved. ADRs retain their proposed/accepted/superseded lifecycle. Research and brainstorming start as `draft` and serve as optional references when linked to task context. Implementation is not acceptance.

Archive completed plans or obsolete notes with traceable IDs; supersede ADRs rather than erasing rationale. Avoid duplicative documents that merely restate existing canonical records.

## Initial implementation status

The CLI allocates record IDs, validates relationships and Markdown links during creation, and appends category-index links. Run `agentctl knowledge add -h` for supported section names and ways to supply their Markdown. Run `agentctl docs lint` or `agentctl doctor` to check frontmatter, record relationships, task notes, and local file and heading links after edits. External URLs are left to readers and do not require a network request. See [templates](../../templates/records/README.md).

## Verification gates and task-local notes

Executable verification gates live in `.agentctl/checks.yaml`, managed by `agentctl verify list|add` and run by `agentctl verify`. Adding a gate is a repository change subject to review. Gate failures are not acceptance receipts.

Task-specific notes belong directly in the story's `## Notes` section, managed through `agentctl task [ID] notes`; they are automatically included in task context. The inbox remains for discoveries that need broader classification.
