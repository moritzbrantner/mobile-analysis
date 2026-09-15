import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUnlighthouseUrls } from '../src/unlighthouse.js';
import type { MobileAnalysisConfig } from '../src/model.js';

function config(routes: string[]): MobileAnalysisConfig {
  return {
    target: {
      name: 'Pages app',
      baseUrl: 'https://example.github.io/mobile-app/',
    },
    routes,
    devices: [],
    scenarios: [],
    unlighthouse: {
      enabled: true,
      budget: 80,
    },
    native: {
      enabled: false,
      appId: 'dev.example.app',
    },
  };
}

test('resolves relative routes inside a GitHub Pages subpath', () => {
  assert.deepEqual(
    resolveUnlighthouseUrls(config(['./', 'tasks/', 'converter/'])),
    [
      'https://example.github.io/mobile-app/',
      'https://example.github.io/mobile-app/tasks/',
      'https://example.github.io/mobile-app/converter/',
    ],
  );
});

test('preserves explicitly origin-rooted routes', () => {
  assert.deepEqual(
    resolveUnlighthouseUrls(config(['/health/'])),
    ['https://example.github.io/health/'],
  );
});
