import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

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

test('project manifests contain only schema and task-context settings', () => {
  for (const file of ['.agentctl/project.yaml', 'templates/repository/.agentctl/project.yaml']) {
    const config = parseYaml(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(config).sort(), ['context', 'schemaVersion']);
    assert.equal(config.schemaVersion, 1);
    assert.ok(Array.isArray(config.context.include) && config.context.include.length > 0);
    assert.ok(Array.isArray(config.context.reference));
  }
});

test('required verification profiles cannot silently pass', () => {
  const content = readFileSync('.agentctl/checks.yaml', 'utf8');
  assert.match(content, /missingRequiredCheck:\s*block/);
  assert.match(content, /unconfiguredProfile:\s*block/);
});
