import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'AGENTS.md',
  '.agentctl/project.yaml',
  '.agentctl/checks.yaml',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/knowledge/package.json',
  'packages/verification/package.json',
  'packages/pi-ultracode-agentctl-bridge/package.json',
  'agents/architect.md',
  'agents/worker.md',
  'agents/reviewer.md',
  'agents/curator.md',
  'workflows/feature.md',
  'templates/repository/AGENTS.md',
  'templates/repository/.agentctl/project.yaml',
  'templates/repository/.agentctl/checks.yaml',
  'templates/records/prd.md',
  'templates/records/adr.md',
  'templates/records/story.md',
  'docs/product/PRD-0001.md',
  'docs/decisions/ADR-0001-repository-knowledge.md',
  'docs/decisions/ADR-0002-ultracode-poc.md',
  'docs/decisions/ADR-0003-self-hosting.md',
  'docs/work/items/STORY-0001-bootstrap-cli.md'
];

test('required monorepo and harness scaffold exists', () => {
  for (const file of required) assert.ok(existsSync(file), `Missing ${file}`);
});

test('root workspace remains private and includes packages', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(manifest.private, true);
  assert.ok(manifest.workspaces.includes('packages/*'));
});

test('all initial packages are private until publishing is implemented', () => {
  for (const pkg of ['cli', 'core', 'knowledge', 'verification', 'pi-ultracode-agentctl-bridge']) {
    const manifest = JSON.parse(readFileSync(`packages/${pkg}/package.json`, 'utf8'));
    assert.equal(manifest.private, true, `${pkg} is unexpectedly publishable`);
  }
});

test('root project uses Ultracode and explicitly sequential workers', () => {
  const content = readFileSync('.agentctl/project.yaml', 'utf8');
  assert.match(content, /engine:\s*ultracode/);
  assert.match(content, /maxConcurrentWriters:\s*1/);
});

test('required verification profiles cannot silently pass', () => {
  const content = readFileSync('.agentctl/checks.yaml', 'utf8');
  assert.match(content, /missingRequiredCheck:\s*block/);
  assert.match(content, /unconfiguredProfile:\s*block/);
});
