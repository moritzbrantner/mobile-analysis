/** Bounded XState path planning, independent of the browser/native execution adapter. */
import type { AnyMachineSnapshot, AnyStateMachine } from 'xstate';
import { getAdjacencyMap, getShortestPaths, getSimplePaths } from 'xstate/graph';

export type StatePathEvent = { type: string; [key: string]: unknown };
export type StatePathStep = { event: StatePathEvent; state: string };
export type StatePath = { id: string; name: string; steps: readonly StatePathStep[] };
export type StatePathTier = 'pr' | 'full';
export type StatePathPlan = {
  initialState: string;
  paths: readonly StatePath[];
  coverage: {
    states: readonly string[];
    transitions: readonly string[];
    reachableVertices: number;
    generatedPaths: number;
    tier: StatePathTier;
  };
};
export type StatePathOptions = {
  id: string;
  model: AnyStateMachine;
  events: readonly (string | StatePathEvent)[];
  tier?: StatePathTier;
  maxPaths?: number;
};

type Snapshot = { value: unknown; context?: unknown };
type GraphStep = { event: StatePathEvent; state: Snapshot };
type GraphPath = { state: Snapshot; steps: readonly GraphStep[] };
type Vertex = { state: Snapshot; transitions: Record<string, GraphStep> };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('State-path events and context must be JSON-serializable');
  return json;
}

function nameState(state: Snapshot): string {
  const value = state.value;
  if (typeof value !== 'string' && (!value || typeof value !== 'object')) {
    throw new Error('State-path models require named XState states');
  }
  const name = typeof value === 'string' ? value : stableJson(value);
  const context = state.context;
  if (context && typeof context === 'object' && Object.keys(context).length > 0) {
    return `${name} ${stableJson(context)}`;
  }
  return name;
}

function eventName(event: StatePathEvent): string {
  const { type, ...payload } = event;
  return Object.keys(payload).length === 0 ? type : `${type} ${stableJson(payload)}`;
}

function stripped(path: GraphPath): GraphStep[] {
  return path.steps.filter((step) => step.event.type !== 'xstate.init');
}

function pathKey(path: readonly GraphStep[]): string {
  return stableJson(path.map((step) => step.event));
}

function isPrefix(shorter: readonly GraphStep[], longer: readonly GraphStep[]): boolean {
  return shorter.length < longer.length && shorter.every((step, index) =>
    stableJson(step.event) === stableJson(longer[index]!.event));
}

/**
 * PR paths reach every state and transition, including self-loops. The opt-in full
 * tier also adds simple paths. Both tiers fail closed on an exceeded path budget.
 */
export function generateStatePaths(spec: StatePathOptions): StatePathPlan {
  if (!spec.id.trim()) throw new Error('State-path model id must be non-empty');
  const tier = spec.tier ?? 'pr';
  if (tier !== 'pr' && tier !== 'full') throw new Error('Unknown state-path tier');
  const maxPaths = spec.maxPaths ?? (tier === 'pr' ? 40 : 200);
  if (!Number.isSafeInteger(maxPaths) || maxPaths < 1) {
    throw new Error('maxPaths must be a positive integer');
  }
  if (maxPaths > 400) throw new Error('maxPaths must not exceed 400');
  const events = spec.events.map((event) => typeof event === 'string' ? { type: event } : event);
  if (events.some((event) => !event.type?.trim())) {
    throw new Error('Every modeled event requires a non-empty type');
  }
  const uniqueEvents = new Map(events.map((event) => [stableJson(event), event]));
  if (uniqueEvents.size !== events.length) throw new Error('Duplicate modeled events');
  const options = {
    events: [...uniqueEvents].sort(([a], [b]) => a.localeCompare(b)).map(([, event]) => event),
    filterEvents: (snapshot: AnyMachineSnapshot, event: StatePathEvent) => snapshot.can(event),
    limit: Math.min(10_000, Math.max(100, maxPaths * 20)),
  };

  const shortest = new Map<string, GraphStep[]>();
  let initialState: string | undefined;
  for (const path of getShortestPaths(spec.model, options) as unknown as GraphPath[]) {
    const steps = stripped(path);
    shortest.set(JSON.stringify(path.state), steps);
    if (steps.length === 0) initialState = nameState(path.state);
  }
  if (!initialState) throw new Error(`State-path model ${spec.id} has no initial state`);

  const adjacency = getAdjacencyMap(spec.model, options) as unknown as Record<string, Vertex>;
  const candidates: GraphStep[][] = [...shortest.values()];
  const states = new Set<string>([initialState]);
  const transitions = new Set<string>();
  for (const vertex of Object.values(adjacency)) {
    const from = nameState(vertex.state);
    states.add(from);
    const prefix = shortest.get(JSON.stringify(vertex.state));
    if (!prefix) throw new Error(`No shortest path reaches ${from}`);
    for (const step of Object.values(vertex.transitions)) {
      const to = nameState(step.state);
      states.add(to);
      transitions.add(`${from} --${eventName(step.event)}--> ${to}`);
      candidates.push([...prefix, step]);
    }
  }
  if (tier === 'full') {
    for (const path of getSimplePaths(spec.model, options) as unknown as GraphPath[]) {
      candidates.push(stripped(path));
    }
  }
  const unique = new Map(candidates.map((path) => [pathKey(path), path]));
  const paths = [...unique.values()]
    .filter((path) => ![...unique.values()].some((other) => isPrefix(path, other)))
    .sort((left, right) => pathKey(left).localeCompare(pathKey(right)));
  if (paths.length > maxPaths) {
    throw new Error(`State-path model ${spec.id}: ${paths.length} paths exceed maxPaths=${maxPaths}`);
  }
  const traversed = new Set<string>();
  for (const path of paths) {
    let from = initialState;
    for (const step of path) {
      const to = nameState(step.state);
      traversed.add(`${from} --${eventName(step.event)}--> ${to}`);
      from = to;
    }
  }
  for (const edge of transitions) {
    if (!traversed.has(edge)) throw new Error(`State-path model ${spec.id}: uncovered transition ${edge}`);
  }
  return {
    initialState,
    paths: paths.map((path, index) => ({
      id: `${spec.id}-path-${String(index + 1).padStart(2, '0')}`,
      name: path.map((step) => eventName(step.event)).join(' > ') || 'initial',
      steps: path.map((step) => ({ event: step.event, state: nameState(step.state) })),
    })),
    coverage: {
      states: [...states].sort(),
      transitions: [...transitions].sort(),
      reachableVertices: Object.keys(adjacency).length,
      generatedPaths: paths.length,
      tier,
    },
  };
}
