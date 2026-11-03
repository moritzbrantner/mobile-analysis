/** Mobile web/native scenarios composed from the shared independent path planner. */
import type { AnyStateMachine } from 'xstate';
import type { Scenario, ScenarioStep } from './model.js';
import { generateStatePaths } from './state-paths.js';

export type MachineJourney = {
  id: string;
  name: string;
  path: string;
  model: AnyStateMachine;
  /** Real user actions for each modeled event, independent of application code. */
  actions: Record<string, readonly ScenarioStep[]>;
  /** Observable assertions for each reached atomic state, including the initial state. */
  assertions: Record<string, readonly ScenarioStep[]>;
  maxPaths?: number;
};

export type MachineCoverage = {
  states: readonly string[];
  transitions: readonly string[];
  generatedPaths: number;
};
export type GeneratedMachineScenarios = { scenarios: Scenario[]; coverage: MachineCoverage };

export function generateMachineScenarios(journey: MachineJourney): GeneratedMachineScenarios {
  if (!journey.id.trim() || !journey.name.trim() || !journey.path.trim()) {
    throw new Error('Machine journey id, name and path must be non-empty');
  }
  const planned = generateStatePaths({
    id: journey.id,
    model: journey.model,
    events: Object.keys(journey.actions),
    ...(journey.maxPaths === undefined ? {} : { maxPaths: journey.maxPaths }),
  });
  for (const state of planned.coverage.states) {
    if (!journey.assertions[state]?.length) {
      throw new Error(`Machine journey ${journey.id}: missing visible assertions for ${state}`);
    }
  }
  const scenarios = planned.paths.map((path): Scenario => {
    const steps: ScenarioStep[] = [...journey.assertions[planned.initialState]!];
    for (const step of path.steps) {
      const actionSteps = journey.actions[step.event.type];
      if (!actionSteps) throw new Error(`Machine journey ${journey.id}: no actions for ${step.event.type}`);
      steps.push(...actionSteps, ...journey.assertions[step.state]!);
    }
    return { id: path.id, name: `${journey.name}: ${path.name}`, path: journey.path, steps };
  });
  return {
    scenarios,
    coverage: {
      states: planned.coverage.states,
      transitions: planned.coverage.transitions,
      generatedPaths: planned.coverage.generatedPaths,
    },
  };
}
