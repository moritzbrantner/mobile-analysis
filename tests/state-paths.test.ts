import assert from 'node:assert/strict';
import test from 'node:test';
import { assign, createMachine } from 'xstate';
import { generateStatePaths } from '../src/state-paths.js';

const dialog = createMachine({
  id: 'dialog',
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'open' } },
    open: {
      initial: 'viewing',
      states: {
        viewing: { on: { EDIT: 'editing' } },
        editing: { on: { CANCEL: 'viewing' } },
      },
      on: { CLOSE: 'closed' },
    },
  },
});

test('generates stable edge-covering paths across nested states and self-loops', () => {
  const spec = { id: 'dialog', model: dialog, events: ['OPEN', 'EDIT', 'CANCEL', 'CLOSE'] };
  const first = generateStatePaths(spec);
  assert.deepEqual(first, generateStatePaths({ ...spec, events: [...spec.events].reverse() }));
  assert.equal(first.initialState, 'closed');
  assert.deepEqual(first.coverage.states, ['closed', '{"open":"editing"}', '{"open":"viewing"}']);
  assert.equal(first.coverage.transitions.length, 5);
  assert.equal(first.coverage.generatedPaths, first.paths.length);
  assert.ok(first.paths.every((path) => path.id.startsWith('dialog-path-')));
  assert.ok(first.paths.some((path) => path.steps.some((step) => step.event.type === 'CANCEL')));
  assert.ok(first.paths.every((path) => path.steps.every((step) => first.coverage.states.includes(step.state))));
});

test('preserves context, guards, and distinct event payloads', () => {
  const model = createMachine({
    id: 'retry',
    initial: 'ready',
    context: { attempts: 0 },
    states: {
      ready: {
        on: {
          TRY: {
            guard: ({ context }) => context.attempts < 2,
            actions: assign({ attempts: ({ context }) => context.attempts + 1 }),
          },
        },
      },
    },
  });
  const plan = generateStatePaths({
    id: 'retry', model,
    events: [{ type: 'TRY', input: 'keyboard' }, { type: 'TRY', input: 'touch' }],
    maxPaths: 20,
  });
  assert.equal(plan.coverage.reachableVertices, 3);
  assert.equal(plan.coverage.transitions.length, 4);
  assert.ok(plan.coverage.states.some((name) => name.includes('"attempts":2')));
  assert.ok(plan.paths.some((path) => path.steps.length === 2));
  assert.ok(plan.paths.some((path) => path.steps.some((step) => step.event.input === 'touch')));
  assert.ok(plan.paths.every((path) => path.steps.length <= 2));
});

test('enforces a bounded full tier and represents an initial-only machine', () => {
  const initial = generateStatePaths({
    id: 'static', model: createMachine({ id: 'static', initial: 'ready', states: { ready: {} } }), events: [],
  });
  assert.deepEqual(initial.paths.map((path) => path.name), ['initial']);
  assert.deepEqual(initial.coverage.transitions, []);
  const pr = generateStatePaths({ id: 'dialog', model: dialog, events: ['OPEN', 'EDIT', 'CANCEL', 'CLOSE'] });
  const full = generateStatePaths({
    id: 'dialog', model: dialog, events: ['OPEN', 'EDIT', 'CANCEL', 'CLOSE'], tier: 'full',
  });
  assert.ok(full.paths.length >= pr.paths.length);
  assert.equal(full.coverage.tier, 'full');
  assert.throws(
    () => generateStatePaths({ id: 'dialog', model: dialog, events: ['OPEN', 'EDIT', 'CANCEL', 'CLOSE'], maxPaths: 1 }),
    /paths exceed maxPaths=1/,
  );
  assert.throws(() => generateStatePaths({ id: '', model: dialog, events: [] }), /id must be non-empty/);
  assert.throws(() => generateStatePaths({ id: 'd', model: dialog, events: ['OPEN', 'OPEN'] }), /Duplicate modeled events/);
});
