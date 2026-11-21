# Templates for target repositories

The future CLI `init` will install a small repository-facing scaffold from [`repository/`](repository/README.md), preserving existing project files. It will also use [`records/`](records/README.md) for typed PRDs, ADRs and work items.

The repository templates are installed by `agentctl init`, including the project overview and conventions files used for automatic project context; existing files are never overwritten. Record templates document the conventions followed by the CLI's typed record creation. Template changes should have unit tests and be reviewed before release.
