import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaestroFlow } from '../src/maestro.js';

test('translates visible text targets into a Maestro flow', () => {
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

test('emits nested Maestro selectors for test ids', () => {
  const flow = buildMaestroFlow('dev.example.app', {
    id: 'save',
    name: 'Save',
    path: '/',
    steps: [
      { action: 'tap', target: { testId: 'save-button' } },
      { action: 'expectVisible', target: { testId: 'saved-banner' } },
    ],
  });

  assert.match(flow.yaml, /- tapOn:\n    id: "save-button"/);
  assert.match(flow.yaml, /- assertVisible:\n    id: "saved-banner"/);
  assert.deepEqual(flow.warnings, []);
});
