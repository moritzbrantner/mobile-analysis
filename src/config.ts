import { readFile } from 'node:fs/promises';
import {
  DEFAULT_DEVICES,
  type AriaRole,
  type DeviceSpec,
  type MobileAnalysisConfig,
  type Scenario,
  type ScenarioStep,
  type Target,
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

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const result = positiveNumber(value, label);
  if (!Number.isInteger(result)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return result;
}

const ariaRoles = new Set<AriaRole>([
  'button',
  'checkbox',
  'dialog',
  'link',
  'menuitem',
  'option',
  'radio',
  'tab',
  'textbox',
]);

function parseTarget(value: unknown, label: string): Target {
  const item = record(value, label);
  const selector = optionalString(item.selector, `${label}.selector`);
  const testId = optionalString(item.testId, `${label}.testId`);
  const roleRaw = optionalString(item.role, `${label}.role`);
  const text = optionalString(item.text, `${label}.text`);
  const name = optionalString(item.name, `${label}.name`);

  let role: AriaRole | undefined;
  if (roleRaw !== undefined) {
    if (!ariaRoles.has(roleRaw as AriaRole)) {
      throw new Error(`${label}.role '${roleRaw}' is not supported`);
    }
    role = roleRaw as AriaRole;
  }

  const locatorCount = [selector, testId, role, text].filter((candidate) => candidate !== undefined).length;
  if (locatorCount !== 1) {
    throw new Error(`${label} must define exactly one of selector, testId, role, or text`);
  }
  if (name !== undefined && role === undefined) {
    throw new Error(`${label}.name is only valid with a role target`);
  }

  return {
    ...(selector !== undefined ? { selector } : {}),
    ...(testId !== undefined ? { testId } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(text !== undefined ? { text } : {}),
  };
}

function parseSteps(value: unknown, scenarioId: string): ScenarioStep[] {
  if (!Array.isArray(value)) {
    throw new Error(`scenario ${scenarioId}.steps must be an array`);
  }

  return value.map((raw, index): ScenarioStep => {
    const label = `scenario ${scenarioId}.steps[${index}]`;
    const step = record(raw, label);
    const action = requiredString(step.action, `${label}.action`);

    switch (action) {
      case 'tap':
        return { action, target: parseTarget(step.target, `${label}.target`) };
      case 'fill':
        return {
          action,
          target: parseTarget(step.target, `${label}.target`),
          value: stringValue(step.value, `${label}.value`),
        };
      case 'press':
        return { action, key: requiredString(step.key, `${label}.key`) };
      case 'expectVisible':
        return { action, target: parseTarget(step.target, `${label}.target`) };
      case 'expectText':
        return {
          action,
          target: parseTarget(step.target, `${label}.target`),
          text: stringValue(step.text, `${label}.text`),
        };
      case 'wait': {
        if (typeof step.ms !== 'number' || !Number.isFinite(step.ms) || step.ms < 0) {
          throw new Error(`${label}.ms must be a non-negative number`);
        }
        return { action, ms: step.ms };
      }
      case 'screenshot':
        return { action, name: requiredString(step.name, `${label}.name`) };
      default:
        throw new Error(`unsupported action '${action}' in scenario ${scenarioId}`);
    }
  });
}

function parseScenarios(value: unknown): Scenario[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('scenarios must be an array');

  const seenIds = new Set<string>();
  return value.map((raw, index) => {
    const item = record(raw, `scenarios[${index}]`);
    const id = requiredString(item.id, `scenarios[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`duplicate scenario id '${id}'`);
    }
    seenIds.add(id);

    return {
      id,
      name: requiredString(item.name, `scenarios[${index}].name`),
      path: requiredString(item.path, `scenarios[${index}].path`),
      steps: parseSteps(item.steps ?? [], id),
    };
  });
}

function parseDevices(value: unknown): DeviceSpec[] {
  if (value === undefined) return DEFAULT_DEVICES;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('devices must be a non-empty array');
  }

  const seenIds = new Set<string>();
  return value.map((raw, index): DeviceSpec => {
    const label = `devices[${index}]`;
    const item = record(raw, label);
    const id = requiredString(item.id, `${label}.id`);
    if (seenIds.has(id)) {
      throw new Error(`duplicate device id '${id}'`);
    }
    seenIds.add(id);

    const browser = requiredString(item.browser, `${label}.browser`);
    if (browser !== 'chromium' && browser !== 'webkit') {
      throw new Error(`${label}.browser must be 'chromium' or 'webkit'`);
    }

    const viewport = record(item.viewport, `${label}.viewport`);
    return {
      id,
      name: requiredString(item.name, `${label}.name`),
      browser,
      viewport: {
        width: positiveInteger(viewport.width, `${label}.viewport.width`),
        height: positiveInteger(viewport.height, `${label}.viewport.height`),
      },
      deviceScaleFactor: positiveNumber(item.deviceScaleFactor, `${label}.deviceScaleFactor`),
      isMobile: requiredBoolean(item.isMobile, `${label}.isMobile`),
      hasTouch: requiredBoolean(item.hasTouch, `${label}.hasTouch`),
    };
  });
}

function parseRoutes(value: unknown): string[] {
  if (value === undefined) return ['/'];
  if (!Array.isArray(value)) throw new Error('routes must be an array');

  const seen = new Set<string>();
  return value.map((route, index) => {
    const parsed = requiredString(route, `routes[${index}]`);
    if (seen.has(parsed)) {
      throw new Error(`duplicate route '${parsed}'`);
    }
    seen.add(parsed);
    return parsed;
  });
}

export function normalizeConfig(raw: unknown, overrideBaseUrl?: string): MobileAnalysisConfig {
  const root = record(raw, 'config');
  const target = record(root.target ?? {}, 'target');
  const baseUrl = overrideBaseUrl ?? requiredString(target.baseUrl, 'target.baseUrl');
  new URL(baseUrl);

  const routes = parseRoutes(root.routes);

  const unlighthouseRaw = record(root.unlighthouse ?? {}, 'unlighthouse');
  const budgetRaw = unlighthouseRaw.budget ?? 80;
  if (typeof budgetRaw !== 'number' || budgetRaw < 1 || budgetRaw > 100) {
    throw new Error('unlighthouse.budget must be between 1 and 100');
  }
  const unlighthouseEnabled = unlighthouseRaw.enabled === undefined
    ? true
    : requiredBoolean(unlighthouseRaw.enabled, 'unlighthouse.enabled');

  const nativeRaw = root.native === undefined ? undefined : record(root.native, 'native');

  return {
    target: {
      name: typeof target.name === 'string' && target.name.trim() !== '' ? target.name : new URL(baseUrl).hostname,
      baseUrl,
    },
    routes,
    devices: parseDevices(root.devices),
    scenarios: parseScenarios(root.scenarios),
    unlighthouse: {
      enabled: unlighthouseEnabled,
      budget: budgetRaw,
    },
    ...(nativeRaw
      ? {
          native: {
            enabled: nativeRaw.enabled === undefined
              ? true
              : requiredBoolean(nativeRaw.enabled, 'native.enabled'),
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
