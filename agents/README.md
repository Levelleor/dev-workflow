# Portable agent role contracts

These are role specifications, **not yet installed Pi agent definitions**. The eventual init command will map them into the target runtime's supported format and configuration.

- [architect](architect.md): convert requirements into scoped implementation contracts.
- [worker](worker.md): make bounded code changes and submit evidence.
- [reviewer](reviewer.md): independently inspect a candidate without editing it.
- [curator](curator.md): maintain knowledge quality and discoverability on demand.

The execution controller, not an agent's prose, owns final state transitions and gates.
