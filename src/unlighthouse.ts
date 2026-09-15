import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdapterState, Finding, MobileAnalysisConfig } from './model.js';

export interface UnlighthouseResult {
  status: AdapterState;
  findings: Finding[];
  details: string;
}

export async function runUnlighthouse(config: MobileAnalysisConfig, outputDir: string): Promise<UnlighthouseResult> {
  if (!config.unlighthouse.enabled) {
    return { status: 'skipped', findings: [], details: 'Disabled by configuration.' };
  }

  const targetDir = join(outputDir, 'unlighthouse');
  await mkdir(targetDir, { recursive: true });
  const args = [
    '--site', config.target.baseUrl,
    '--budget', String(config.unlighthouse.budget),
    '--mobile',
    '--build-static',
    '--reporter', 'jsonExpanded',
    '--output-path', targetDir,
  ];
  if (config.routes.length > 0) args.push('--urls', config.routes.join(','));

  const result = spawnSync('unlighthouse-ci', args, { encoding: 'utf8' });
  await writeFile(join(targetDir, 'stdout.log'), result.stdout ?? '', 'utf8');
  await writeFile(join(targetDir, 'stderr.log'), result.stderr ?? '', 'utf8');

  if (result.error) {
    return {
      status: 'skipped',
      details: 'unlighthouse-ci is not available on PATH.',
      findings: [{
        id: 'unlighthouse:not-installed',
        source: 'unlighthouse',
        severity: 'warning',
        title: 'Unlighthouse was not executed',
        details: result.error.message,
      }],
    };
  }

  if (result.status !== 0) {
    return {
      status: 'failed',
      details: `unlighthouse-ci exited with ${result.status ?? 'unknown status'}.`,
      findings: [{
        id: 'unlighthouse:budget',
        source: 'unlighthouse',
        severity: 'error',
        title: 'Unlighthouse mobile audit failed',
        details: `One or more pages failed the configured score budget (${config.unlighthouse.budget}). See unlighthouse/ for the complete report.`,
        artifact: 'unlighthouse/',
      }],
    };
  }

  return { status: 'passed', findings: [], details: `All scanned pages met budget ${config.unlighthouse.budget}.` };
}
