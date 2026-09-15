export type BrowserEngine = 'chromium' | 'webkit';
export type Severity = 'error' | 'warning' | 'info';
export type AdapterState = 'passed' | 'failed' | 'skipped';
export type ScenarioState = 'passed' | 'failed';

export interface DeviceSpec {
  id: string;
  name: string;
  browser: BrowserEngine;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export type AriaRole =
  | 'button'
  | 'checkbox'
  | 'dialog'
  | 'link'
  | 'menuitem'
  | 'option'
  | 'radio'
  | 'tab'
  | 'textbox';

export interface Target {
  selector?: string;
  testId?: string;
  role?: AriaRole;
  name?: string;
  text?: string;
}

export type ScenarioStep =
  | { action: 'tap'; target: Target }
  | { action: 'fill'; target: Target; value: string }
  | { action: 'press'; key: string }
  | { action: 'expectVisible'; target: Target }
  | { action: 'expectText'; target: Target; text: string }
  | { action: 'wait'; ms: number }
  | { action: 'screenshot'; name: string };

export interface Scenario {
  id: string;
  name: string;
  path: string;
  steps: ScenarioStep[];
}

export interface NativeConfig {
  enabled: boolean;
  appId: string;
}

export interface UnlighthouseConfig {
  enabled: boolean;
  budget: number;
}

export interface MobileAnalysisConfig {
  target: {
    name: string;
    baseUrl: string;
  };
  routes: string[];
  devices: DeviceSpec[];
  scenarios: Scenario[];
  unlighthouse: UnlighthouseConfig;
  native?: NativeConfig;
}

export interface Finding {
  id: string;
  source: 'playwright' | 'unlighthouse' | 'maestro';
  severity: Severity;
  title: string;
  details?: string;
  deviceId?: string;
  scenarioId?: string;
  url?: string;
  artifact?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  deviceId: string;
  status: ScenarioState;
  durationMs: number;
  url: string;
  screenshot?: string;
}

export interface AdapterResult {
  name: 'playwright' | 'unlighthouse' | 'maestro';
  status: AdapterState;
  durationMs: number;
  details?: string;
}

export interface AnalysisReport {
  schemaVersion: 1;
  createdAt: string;
  target: MobileAnalysisConfig['target'];
  revision?: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
  };
  summary: {
    errors: number;
    warnings: number;
    info: number;
    scenariosPassed: number;
    scenariosFailed: number;
  };
  adapters: AdapterResult[];
  scenarios: ScenarioResult[];
  findings: Finding[];
}

export interface AnalyzeOptions {
  outputDir: string;
  skipUnlighthouse?: boolean;
  runMaestro?: boolean;
}

export const DEFAULT_DEVICES: DeviceSpec[] = [
  {
    id: 'iphone-small',
    name: 'iPhone-sized / WebKit',
    browser: 'webkit',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'pixel',
    name: 'Pixel-sized / Chromium',
    browser: 'chromium',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
];
