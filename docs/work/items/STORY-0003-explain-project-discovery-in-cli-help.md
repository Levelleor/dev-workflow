---
id: STORY-0003
type: story
status: implemented
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Explain project discovery in CLI help

## Outcome

## Acceptance criteria
Update agentctl --help to explain that .agentctl/project.yaml identifies the project root. Add a CLI unit test checking that the help output contains this explanation. Do not change task-discovery behaviour. Ensure npm test passes.

## Verification plan

## Notes

### N001
Implemented STORY-0003: agentctl --help now explains that the nearest .agentctl/project.yaml found while searching upward identifies the project root; discovery logic in project.ts unchanged. Added a CLI help test asserting marker and project-root wording.

### N002
Review accepted in round 1: STORY-0003 acceptance criteria are satisfied. `agentctl --help` (packages/cli/src/cli.ts help string) now states that commands search upward from the current directory and the nearest `.agentctl/project.yaml` identifies the project root, matching `findProjectRoot` in packages/cli/src/project.ts. A dedicated CLI unit test (packages/cli/test/cli.test.ts, "explains project discovery through the project marker in help") asserts both the marker and "identifies the project root" in `--help` output, and the marker/wording appears only in that explanation so the test is meaningful. Task-discovery behaviour is unchanged: `findProjectRoot` is still the sole upward-search marker lookup used by task commands, and its existing tests in project.test.ts pass. The trusted `scaffold` gate (`npm test`) passed with exit code 0 across CLI, bridge and root suites (58/7/5 tests).
