# Monorepo and publication

The CLI, core contracts, knowledge adapter, verifier and Ultracode adapter live in separate npm workspace packages. The CLI is intended to install globally, independently of every target repository.

All package manifests currently set `private: true`. No package should be published before binary entry points, build output, tests, licence, release automation and naming have been approved.

Target repositories will eventually receive small configuration and documentation templates from `templates/repository/`. The CLI's implementation is **never copied into target repositories**.

dev-workflow follows that rule itself: its live `.agentctl/` is a project instance, while `templates/` contains distributable defaults.
