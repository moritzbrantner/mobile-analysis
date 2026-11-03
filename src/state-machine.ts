/**
 * Bounded, independent XState acceptance contracts for mobile web and native journeys.
 * The model belongs to the consumer; generated steps run through the existing Playwright
 * and Maestro adapters without inserting a state machine into the application itself.
 */
import type { AnyMachineSnapshot, AnyStateMachine } from 'xstate';
import { getAdjacencyMap, getShortestPaths } from 'xstate/graph';
import type { Scenario, ScenarioStep } from './model.js';

export type MachineJourney = {
  id: string;
  name: string;
  path: string;
  model: AnyStateMachine;
  /** Real user actions for each modeled event, independent of application code. */
  actions: Record<string, readonly ScenarioStep[]>;
  /** Observable assertions for each atomic state, including the initial state. */
  assertions: Record<string, readonly ScenarioStep[]>;
  maxPaths?: number;
};

export type MachineCoverage = {
  states: readonly string[];
  transitions: readonly string[];
  generatedPaths: number;
};

export type GeneratedMachineScenarios = {
  scenarios: Scenario[];
  coverage: MachineCoverage;
};

type Snapshot = { value: unknown };
type Step = { event: { type: string }; state: Snapshot };
type Path = { state: Snapshot; steps: readonly Step[] };
type Vertex = {
  state: Snapshot;
  transitions: Record<string, Step>;
};

function stateName(snapshot: Snapshot): string {
  if (typeof snapshot.value !== 'string') {
    throw new Error('Mobile journeys require small, atomic XState models with string state names');
  }
  return snapshot.value;
}

function stripInitialization(path: Path): Step[] {
  return path.steps.filter((step) => step.event.type !== 'xstate.init');
}

function pathKey(path: readonly Step[]): string {
  return path.map((step) => step.event.type).join(' > ');
}

/**
 * A shortest path to each reachable vertex plus each outgoing edge covers guarded and
 * self-loop transitions missed by shortest-state paths alone. Prefix paths are removed
 * because every intermediate state is asserted on longer paths.
 */
export function generateMachineScenarios(journey: MachineJourney): GeneratedMachineScenarios {
  if (!journey.id.trim() || !journey.name.trim() || !journey.path.trim()) {
    throw new Error('Machine journey id, name and path must be non-empty');
  }
  const maxPaths = journey.maxPaths ?? 40;
  if (!Number.isSafeInteger(maxPaths) || maxPaths < 1) {
    throw new Error('maxPaths must be a positive integer');
  }

  const options = {
    events: Object.keys(journey.actions).sort().map((type) => ({ type })),
    filterEvents: (snapshot: AnyMachineSnapshot, event: { type: string }) => snapshot.can(event),
    // Also bound exploration itself: an unbounded context must fail before path construction.
    limit: Math.max(100, maxPaths * 20),
  };
  const shortest = new Map<string, Step[]>();
  let initialState: string | undefined;
  for (const path of getShortestPaths(journey.model, options) as unknown as Path[]) {
    const pathSteps = stripInitialization(path);
    shortest.set(JSON.stringify(path.state), pathSteps);
    if (pathSteps.length === 0) initialState = stateName(path.state);
  }

  const adjacency = getAdjacencyMap(journey.model, options) as unknown as Record<string, Vertex>;
  const candidates: Step[][] = [...shortest.values()];
  const states = new Set<string>();
  const transitions = new Set<string>();
  for (const vertex of Object.values(adjacency)) {
    const from = stateName(vertex.state);
    states.add(from);
    const prefix = shortest.get(JSON.stringify(vertex.state));
    if (!prefix) {
      throw new Error(`No shortest path reaches state ${from}`);
    }
    for (const step of Object.values(vertex.transitions)) {
      const to = stateName(step.state);
      states.add(to);
      transitions.add(`${from} --${step.event.type}--> ${to}`);
      candidates.push([...prefix, step]);
    }
  }

  const unique = new Map(
    candidates
      .filter((path) => path.length > 0 || transitions.size === 0)
      .map((path) => [pathKey(path), path]),
  );
  const paths = [...unique]
    .filter(([key]) => ![...unique.keys()].some((other) => other !== key && other.startsWith(`${key} > `)))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, path]) => path);
  if (paths.length > maxPaths) {
    throw new Error(`Machine journey ${journey.id}: ${paths.length} paths exceed maxPaths=${maxPaths}`);
  }

  if (!initialState) {
    throw new Error(`Machine journey ${journey.id}: no initial state in graph`);
  }
  states.add(initialState);
  for (const state of states) {
    if (!journey.assertions[state]?.length) {
      throw new Error(`Machine journey ${journey.id}: missing visible assertions for ${state}`);
    }
  }

  const scenarios = paths.map((path, index): Scenario => {
    const steps: ScenarioStep[] = [...journey.assertions[initialState]!];
    for (const step of path) {
      const actionSteps = journey.actions[step.event.type];
      if (!actionSteps) {
        throw new Error(`Machine journey ${journey.id}: no actions for ${step.event.type}`);
      }
      steps.push(...actionSteps, ...journey.assertions[stateName(step.state)]!);
    }
    return {
      id: `${journey.id}-path-${String(index + 1).padStart(2, '0')}`,
      name: `${journey.name}: ${pathKey(path) || 'initial'}`,
      path: journey.path,
      steps,
    };
  });

  return {
    scenarios,
    coverage: {
      states: [...states].sort(),
      transitions: [...transitions].sort(),
      generatedPaths: scenarios.length,
    },
  };
}
