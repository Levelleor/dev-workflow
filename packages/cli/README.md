# CLI package

**Status: scaffold only.** Candidate npm name: `@levelleor/dev-workflow`. Name, licence, public export surface and binary name should be confirmed before publication. `private: true` prevents accidental release.

Intended interface: `init`, `doctor`, `status`, `work`, `knowledge`, `verify`, `run`, `resume`, `config`.

The CLI should be installed independently of target repositories and expose deterministic repository operations. It must not own a second agent scheduler alongside Ultracode.

Source is intentionally absent pending API and schema decisions.
