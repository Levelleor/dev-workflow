---
id: STORY-0008
type: story
status: implemented
created_at: 2026-11-27
parent: PRD-0001
depends_on: []
priority: 3
related: []
---

# Publish agentctl from versioned Git tags

## Outcome

Publish the CLI to npm through a GitHub Actions workflow that checks the committed version and runs release verification.

## Acceptance criteria

An agentctl version tag or a manual run selecting the same tagged source can publish the CLI. The published tarball contains the CLI and bundled templates under Apache-2.0. The executable reports the package version.

## Verification plan

Run npm run check and the release verification profile. Pack and install the CLI in isolation, exercise the executable and scaffold templates, and verify release ref checks with matching and mismatched tags.

## Notes

### N001
The committed CLI manifest is the version source. Publish accepts a matching agentctl-vX.Y.Z tag on a commit in main history and checks the same commit on manual dispatch. The checked tarball is available for first-release npm scope bootstrap.
