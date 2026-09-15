import { readFile } from 'node:fs/promises';
import {
  DEFAULT_DEVICES,
  type MobileAnalysisConfig,
  type Scenario,
  type ScenarioStep,
} from './model.js';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseSteps(value: unknown, scenarioId: string): ScenarioStep[] {
  if (!Array.isArray(value)) {
    throw new Error(`scenario ${scenarioId}.steps must be an array`);
  }

  const allowed = new Set(['tap', 'fill', 'press', 'expectVisible', 'expectText', 'wait', 'screenshot']);
  return value.map((raw, index) => {
    const step = record(raw, `scenario ${scenarioId}.steps[${index}]`);
    const action = requiredString(step.action, `scenario ${scenarioId}.steps[${index}].action`);
    if (!allowed.has(action)) {
      throw new Error(`unsupported action '${action}' in scenario ${scenarioId}`);
    }
    return step as unknown as ScenarioStep;
  });
}

function parseScenarios(value: unknown): Scenario[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('scenarios must be an array');

  return value.map((raw, index) => {
    const item = record(raw, `scenarios[${index}]`);
    const id = requiredString(item.id, `scenarios[${index}].id`);
    return {
      id,
      name: requiredString(item.name, `scenarios[${index}].name`),
      path: requiredString(item.path, `scenarios[${index}].path`),
      steps: parseSteps(item.steps ?? [], id),
    };
  });
}

export function normalizeConfig(raw: unknown, overrideBaseUrl?: string): MobileAnalysisConfig {
  const root = record(raw, 'config');
  const target = record(root.target ?? {}, 'target');
  const baseUrl = overrideBaseUrl ?? requiredString(target.baseUrl, 'target.baseUrl');
  new URL(baseUrl);

  const routes = root.routes === undefined
    ? ['/']
    : Array.isArray(root.routes)
      ? root.routes.map((route, index) => requiredString(route, `routes[${index}]`))
      : (() => { throw new Error('routes must be an array'); })();

  const unlighthouseRaw = record(root.unlighthouse ?? {}, 'unlighthouse');
  const budgetRaw = unlighthouseRaw.budget ?? 80;
  if (typeof budgetRaw !== 'number' || budgetRaw < 1 || budgetRaw > 100) {
    throw new Error('unlighthouse.budget must be between 1 and 100');
  }

  const nativeRaw = root.native === undefined ? undefined : record(root.native, 'native');

  return {
    target: {
      name: typeof target.name === 'string' && target.name.trim() !== '' ? target.name : new URL(baseUrl).hostname,
      baseUrl,
    },
    routes,
    devices: Array.isArray(root.devices) && root.devices.length > 0
      ? root.devices as MobileAnalysisConfig['devices']
      : DEFAULT_DEVICES,
    scenarios: parseScenarios(root.scenarios),
    unlighthouse: {
      enabled: unlighthouseRaw.enabled === undefined ? true : Boolean(unlighthouseRaw.enabled),
      budget: budgetRaw,
    },
    ...(nativeRaw
      ? {
          native: {
            enabled: nativeRaw.enabled === undefined ? true : Boolean(nativeRaw.enabled),
            appId: requiredString(nativeRaw.appId, 'native.appId'),
          },
        }
      : {}),
  };
}

export async function loadConfig(path: string, overrideBaseUrl?: string): Promise<MobileAnalysisConfig> {
  const content = await readFile(path, 'utf8');
  return normalizeConfig(JSON.parse(content) as unknown, overrideBaseUrl);
}
