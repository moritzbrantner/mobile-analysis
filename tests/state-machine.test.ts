import assert from 'node:assert/strict';
import test from 'node:test';
import { createMachine } from 'xstate';
import { buildMaestroFlow } from '../src/maestro.js';
import { generateMachineScenarios } from '../src/state-machine.js';

const model = createMachine({
  id: 'settings',
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'open' } },
    open: { on: { EDIT: 'edited', CLOSE: 'closed', RELOAD: 'open' } },
    edited: { on: { CANCEL: 'open', APPLY: 'open' } },
  },
});

const journey = {
  id: 'settings',
  name: 'Settings dialog',
  path: '/',
  model,
  actions: {
    OPEN: [{ action: 'tap', target: { role: 'button', name: 'Settings' } }],
    EDIT: [{ action: 'tap', target: { role: 'button', name: 'Change' } }],
    CANCEL: [{ action: 'tap', target: { role: 'button', name: 'Cancel' } }],
    APPLY: [{ action: 'tap', target: { role: 'button', name: 'Apply' } }],
    CLOSE: [{ action: 'tap', target: { role: 'button', name: 'Close' } }],
    RELOAD: [{ action: 'press', key: 'F5' }],
  },
  assertions: {
    closed: [{ action: 'expectVisible', target: { role: 'button', name: 'Settings' } }],
    open: [{ action: 'expectVisible', target: { text: 'Preferences' } }],
    edited: [{ action: 'expectVisible', target: { text: 'Pending changes' } }],
  },
} as const;

test('generates bounded deterministic mobile paths covering every modeled transition', () => {
  const first = generateMachineScenarios(journey);
  const again = generateMachineScenarios(journey);

  assert.deepEqual(first, again);
  assert.deepEqual(first.coverage.states, ['closed', 'edited', 'open']);
  assert.deepEqual(first.coverage.transitions, [
    'closed --OPEN--> open',
    'edited --APPLY--> open',
    'edited --CANCEL--> open',
    'open --CLOSE--> closed',
    'open --EDIT--> edited',
    'open --RELOAD--> open',
  ]);
  assert.equal(first.coverage.generatedPaths, first.scenarios.length);
  assert.ok(first.scenarios.some((scenario) => scenario.name.includes('RELOAD')));
  assert.ok(first.scenarios.every((scenario) => scenario.steps[0]?.action === 'expectVisible'));
  assert.ok(first.scenarios.every((scenario) => scenario.steps.filter((step) => step.action === 'expectVisible').length >= 2));
  assert.ok(first.scenarios.every((scenario) => scenario.id.startsWith('settings-path-')));
});

test('generated paths use the same scenario contract for native Maestro translation', () => {
  const generated = generateMachineScenarios(journey);
  const openPath = generated.scenarios.find((scenario) => scenario.name.includes('OPEN > EDIT > APPLY'));
  assert.ok(openPath);
  const native = buildMaestroFlow('dev.example.app', openPath);
  assert.deepEqual(native.warnings, []);
  assert.match(native.yaml, /tapOn: "Settings"/);
  assert.match(native.yaml, /tapOn: "Apply"/);
  assert.match(native.yaml, /assertVisible: "Pending changes"/);
});

test('rejects missing state assertions and unsafe path budgets', () => {
  assert.throws(
    () => generateMachineScenarios({ ...journey, assertions: { closed: journey.assertions.closed } }),
    /missing visible assertions for/,
  );
  assert.throws(
    () => generateMachineScenarios({ ...journey, maxPaths: 1 }),
    /paths exceed maxPaths=1/,
  );
  assert.throws(
    () => generateMachineScenarios({ ...journey, maxPaths: 0 }),
    /maxPaths must be a positive integer/,
  );
});
