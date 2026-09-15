import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdapterState, Finding, MobileAnalysisConfig, Scenario, Target } from './model.js';

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function selector(target: Target): string | undefined {
  if (target.testId) return `id: ${yamlString(target.testId)}`;
  const visible = target.name ?? target.text;
  if (visible) return yamlString(visible);
  return undefined;
}

export function buildMaestroFlow(appId: string, scenario: Scenario): { yaml: string; warnings: string[] } {
  const lines = [`appId: ${yamlString(appId)}`, '---', '- launchApp'];
  const warnings: string[] = [];

  for (const step of scenario.steps) {
    switch (step.action) {
      case 'tap': {
        const value = selector(step.target);
        if (value) lines.push(`- tapOn: ${value}`);
        else warnings.push(`tap step has no Maestro-compatible target`);
        break;
      }
      case 'fill': {
        const value = selector(step.target);
        if (value) lines.push(`- tapOn: ${value}`);
        else warnings.push(`fill step has no Maestro-compatible target`);
        lines.push(`- inputText: ${yamlString(step.value)}`);
        break;
      }
      case 'press':
        lines.push(`- pressKey: ${yamlString(step.key)}`);
        break;
      case 'expectVisible': {
        const value = selector(step.target);
        if (value) lines.push(`- assertVisible: ${value}`);
        else warnings.push(`expectVisible step has no Maestro-compatible target`);
        break;
      }
      case 'expectText':
        lines.push(`- assertVisible: ${yamlString(step.text)}`);
        break;
      case 'wait':
        lines.push(`- extendedWaitUntil:\n    visible: ".*"\n    timeout: ${Math.max(1000, step.ms)}`);
        break;
      case 'screenshot':
        lines.push(`- takeScreenshot: ${yamlString(step.name)}`);
        break;
    }
  }

  return { yaml: `${lines.join('\n')}\n`, warnings };
}

export async function prepareAndMaybeRunMaestro(
  config: MobileAnalysisConfig,
  outputDir: string,
  run: boolean,
): Promise<{ status: AdapterState; findings: Finding[]; details: string }> {
  if (!config.native?.enabled) return { status: 'skipped', findings: [], details: 'Native analysis is not configured.' };

  const flowsDir = join(outputDir, 'maestro');
  await mkdir(flowsDir, { recursive: true });
  const findings: Finding[] = [];
  const flowPaths: string[] = [];

  for (const scenario of config.scenarios) {
    const generated = buildMaestroFlow(config.native.appId, scenario);
    const path = join(flowsDir, `${scenario.id}.yaml`);
    await writeFile(path, generated.yaml, 'utf8');
    flowPaths.push(path);
    for (const warning of generated.warnings) {
      findings.push({
        id: `maestro-plan:${scenario.id}:${findings.length}`,
        source: 'maestro',
        severity: 'warning',
        title: 'Scenario step could not be translated to Maestro',
        details: warning,
        scenarioId: scenario.id,
      });
    }
  }

  if (!run) {
    return { status: 'skipped', findings, details: `Generated ${flowPaths.length} Maestro flow(s); execution not requested.` };
  }

  for (const path of flowPaths) {
    const result = spawnSync('maestro', ['test', path], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      findings.push({
        id: `maestro-run:${path}`,
        source: 'maestro',
        severity: 'error',
        title: 'Maestro native flow failed',
        details: result.error?.message ?? result.stderr ?? `Exit ${result.status ?? 'unknown'}`,
        artifact: path.replace(`${outputDir}/`, ''),
      });
    }
  }

  return {
    status: findings.some((finding) => finding.severity === 'error') ? 'failed' : 'passed',
    findings,
    details: `Executed ${flowPaths.length} Maestro flow(s).`,
  };
}
