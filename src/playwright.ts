import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit, type Locator, type Page } from 'playwright';
import type {
  DeviceSpec,
  Finding,
  MobileAnalysisConfig,
  Scenario,
  ScenarioResult,
  ScenarioStep,
  Target,
} from './model.js';

export interface PlaywrightAnalysisResult {
  status: 'passed' | 'failed';
  findings: Finding[];
  scenarios: ScenarioResult[];
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function locator(page: Page, target: Target): Locator {
  if (target.selector) return page.locator(target.selector);
  if (target.testId) return page.getByTestId(target.testId);
  if (target.role) return page.getByRole(target.role, target.name ? { name: target.name } : undefined);
  if (target.text) return page.getByText(target.text, { exact: true });
  throw new Error('target requires selector, testId, role, or text');
}

async function runStep(
  page: Page,
  step: ScenarioStep,
  screenshotsDir: string,
  prefix: string,
  useTouch: boolean,
): Promise<void> {
  switch (step.action) {
    case 'tap': {
      const target = locator(page, step.target);
      if (useTouch) await target.tap();
      else await target.click();
      return;
    }
    case 'fill':
      await locator(page, step.target).fill(step.value);
      return;
    case 'press':
      await page.keyboard.press(step.key);
      return;
    case 'expectVisible':
      await locator(page, step.target).waitFor({ state: 'visible' });
      return;
    case 'expectText':
      await locator(page, step.target).filter({ hasText: step.text }).waitFor({ state: 'visible' });
      return;
    case 'wait':
      await page.waitForTimeout(step.ms);
      return;
    case 'screenshot':
      await page.screenshot({ path: join(screenshotsDir, `${prefix}-${slug(step.name)}.png`), fullPage: true });
      return;
  }
}

async function inspectPage(page: Page, device: DeviceSpec, scenario: Scenario, url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    smallTargets: Array.from(document.querySelectorAll([
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      '[role="switch"]',
    ].join(',')))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          && (rect.width < 44 || rect.height < 44);
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || element.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
  }));

  if (metrics.documentWidth > metrics.viewportWidth + 1) {
    findings.push({
      id: `horizontal-overflow:${device.id}:${scenario.id}`,
      source: 'playwright',
      severity: 'error',
      title: 'Horizontal overflow on mobile viewport',
      details: `Document width ${metrics.documentWidth}px exceeds viewport ${metrics.viewportWidth}px.`,
      deviceId: device.id,
      scenarioId: scenario.id,
      url,
    });
  }

  if (metrics.smallTargets.length > 0) {
    findings.push({
      id: `small-touch-targets:${device.id}:${scenario.id}`,
      source: 'playwright',
      severity: 'warning',
      title: `${metrics.smallTargets.length} small interactive target(s) found`,
      details: metrics.smallTargets.map((target) => `${target.label}: ${target.width}x${target.height}`).join('\n'),
      deviceId: device.id,
      scenarioId: scenario.id,
      url,
    });
  }

  return findings;
}

function allScenarios(config: MobileAnalysisConfig): Scenario[] {
  const routeScenarios = config.routes.map((path) => ({
    id: `route-${slug(path) || 'root'}`,
    name: `Load ${path}`,
    path,
    steps: [],
  }));
  return [...routeScenarios, ...config.scenarios];
}

export async function runPlaywrightAnalysis(config: MobileAnalysisConfig, outputDir: string): Promise<PlaywrightAnalysisResult> {
  const screenshotsDir = join(outputDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });
  const findings: Finding[] = [];
  const results: ScenarioResult[] = [];

  for (const device of config.devices) {
    const browser = await (device.browser === 'webkit' ? webkit : chromium).launch();
    try {
      for (const scenario of allScenarios(config)) {
        const started = Date.now();
        const context = await browser.newContext({
          viewport: device.viewport,
          deviceScaleFactor: device.deviceScaleFactor,
          isMobile: device.isMobile,
          hasTouch: device.hasTouch,
        });
        const page = await context.newPage();
        const url = new URL(scenario.path, config.target.baseUrl).toString();
        const prefix = `${slug(device.id)}-${slug(scenario.id)}`;
        const finalScreenshot = join(screenshotsDir, `${prefix}-final.png`);
        let failed = false;

        page.on('console', (message) => {
          if (message.type() === 'error') {
            findings.push({
              id: `console:${device.id}:${scenario.id}:${findings.length}`,
              source: 'playwright',
              severity: 'warning',
              title: 'Browser console error',
              details: message.text(),
              deviceId: device.id,
              scenarioId: scenario.id,
              url,
            });
          }
        });
        page.on('pageerror', (error) => {
          findings.push({
            id: `pageerror:${device.id}:${scenario.id}:${findings.length}`,
            source: 'playwright',
            severity: 'error',
            title: 'Unhandled page error',
            details: error.message,
            deviceId: device.id,
            scenarioId: scenario.id,
            url,
          });
        });
        page.on('requestfailed', (request) => {
          findings.push({
            id: `requestfailed:${device.id}:${scenario.id}:${findings.length}`,
            source: 'playwright',
            severity: 'error',
            title: 'Network request failed',
            details: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`,
            deviceId: device.id,
            scenarioId: scenario.id,
            url,
          });
        });
        page.on('response', (response) => {
          if (response.status() >= 400) {
            findings.push({
              id: `http:${device.id}:${scenario.id}:${findings.length}`,
              source: 'playwright',
              severity: response.status() >= 500 ? 'error' : 'warning',
              title: `HTTP ${response.status()} while loading mobile flow`,
              details: response.url(),
              deviceId: device.id,
              scenarioId: scenario.id,
              url,
            });
          }
        });

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          for (const step of scenario.steps) {
            await runStep(page, step, screenshotsDir, prefix, device.hasTouch);
          }
          findings.push(...await inspectPage(page, device, scenario, url));
        } catch (error) {
          failed = true;
          findings.push({
            id: `scenario:${device.id}:${scenario.id}`,
            source: 'playwright',
            severity: 'error',
            title: `Scenario failed: ${scenario.name}`,
            details: error instanceof Error ? error.message : String(error),
            deviceId: device.id,
            scenarioId: scenario.id,
            url,
            artifact: `screenshots/${prefix}-final.png`,
          });
        } finally {
          await page.screenshot({ path: finalScreenshot, fullPage: true }).catch(() => undefined);
          results.push({
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            deviceId: device.id,
            status: failed ? 'failed' : 'passed',
            durationMs: Date.now() - started,
            url,
            screenshot: `screenshots/${prefix}-final.png`,
          });
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }

  const status = findings.some((finding) => finding.severity === 'error')
    || results.some((scenario) => scenario.status === 'failed')
    ? 'failed'
    : 'passed';

  return { status, findings, scenarios: results };
}
