import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig } from '../src/config.js';

test('normalizes a minimal config with a mobile device matrix', () => {
  const config = normalizeConfig({
    target: { name: 'Example', baseUrl: 'https://example.com' },
  });

  assert.equal(config.target.name, 'Example');
  assert.deepEqual(config.routes, ['/']);
  assert.equal(config.devices.length, 2);
  assert.equal(config.unlighthouse.budget, 80);
});

test('rejects an invalid unlighthouse budget', () => {
  assert.throws(() => normalizeConfig({
    target: { baseUrl: 'https://example.com' },
    unlighthouse: { budget: 101 },
  }));
});
