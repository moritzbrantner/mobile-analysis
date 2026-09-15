import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaestroFlow } from '../src/maestro.js';

test('translates a shared scenario into a Maestro flow', () => {
  const flow = buildMaestroFlow('dev.example.app', {
    id: 'settings',
    name: 'Open settings',
    path: '/',
    steps: [
      { action: 'tap', target: { text: 'Settings' } },
      { action: 'expectVisible', target: { text: 'Preferences' } },
    ],
  });

  assert.match(flow.yaml, /appId: "dev\.example\.app"/);
  assert.match(flow.yaml, /tapOn: "Settings"/);
  assert.match(flow.yaml, /assertVisible: "Preferences"/);
  assert.deepEqual(flow.warnings, []);
});
