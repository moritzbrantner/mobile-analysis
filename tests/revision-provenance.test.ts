import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { analysisRevision } from '../src/analyze.js';

const exact = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
const fallback = '1234567890abcdef1234567890abcdef12345678';

test('explicit mobile-analysis revision overrides ambient GitHub revision and normalizes case', () => {
  assert.equal(
    analysisRevision({ MOBILE_ANALYSIS_REVISION: exact, GITHUB_SHA: fallback }),
    exact.toLowerCase(),
  );
});

test('ambient GitHub revision remains the fallback for direct action use', () => {
  assert.equal(analysisRevision({ GITHUB_SHA: fallback }), fallback);
  assert.equal(analysisRevision({}), undefined);
});

test('revision provenance rejects floating or malformed identities', () => {
  assert.throws(
    () => analysisRevision({ MOBILE_ANALYSIS_REVISION: 'main' }),
    /exact 40-character Git commit SHA/,
  );
});

test('reusable workflow checks out and forwards the explicit consumer revision', () => {
  const root = process.cwd();
  const action = readFileSync(join(root, 'action.yml'), 'utf8');
  const workflow = readFileSync(join(root, '.github', 'workflows', 'analyze.yml'), 'utf8');

  assert.match(action, /revision:\n\s+description: Exact consumer Git revision/);
  assert.match(action, /MOBILE_ANALYSIS_REVISION: \$\{\{ inputs\.revision \}\}/);
  assert.match(workflow, /ref: \$\{\{ inputs\.revision \|\| github\.sha \}\}/);
  assert.match(workflow, /revision: \$\{\{ inputs\.revision \|\| github\.sha \}\}/);
});
