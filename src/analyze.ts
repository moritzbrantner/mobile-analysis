import { rm, mkdir } from 'node:fs/promises';
import process from 'node:process';
import { writeBundle } from './bundle.js';
import { prepareAndMaybeRunMaestro } from './maestro.js';
import type { AdapterResult, AnalysisReport, AnalyzeOptions, Finding, MobileAnalysisConfig } from './model.js';
import { runPlaywrightAnalysis } from './playwright.js';
import { runUnlighthouse } from './unlighthouse.js';

function summary(findings: Finding[], scenarios: AnalysisReport['scenarios']): AnalysisReport['summary'] {
  return {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
    scenariosPassed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    scenariosFailed: scenarios.filter((scenario) => scenario.status === 'failed').length,
  };
}

export async function analyzeMobile(config: MobileAnalysisConfig, options: AnalyzeOptions): Promise<AnalysisReport> {
  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });
  const findings: Finding[] = [];
  const adapters: AdapterResult[] = [];

  const playwrightStarted = Date.now();
  const playwright = await runPlaywrightAnalysis(config, options.outputDir);
  findings.push(...playwright.findings);
  adapters.push({
    name: 'playwright',
    status: playwright.scenarios.some((scenario) => scenario.status === 'failed') ? 'failed' : 'passed',
    durationMs: Date.now() - playwrightStarted,
    details: `${playwright.scenarios.length} device/scenario run(s).`,
  });

  const unlighthouseStarted = Date.now();
  const unlighthouse = options.skipUnlighthouse
    ? { status: 'skipped' as const, findings: [], details: 'Skipped by command line.' }
    : await runUnlighthouse(config, options.outputDir);
  findings.push(...unlighthouse.findings);
  adapters.push({
    name: 'unlighthouse',
    status: unlighthouse.status,
    durationMs: Date.now() - unlighthouseStarted,
    details: unlighthouse.details,
  });

  const maestroStarted = Date.now();
  const maestro = await prepareAndMaybeRunMaestro(config, options.outputDir, options.runMaestro ?? false);
  findings.push(...maestro.findings);
  adapters.push({
    name: 'maestro',
    status: maestro.status,
    durationMs: Date.now() - maestroStarted,
    details: maestro.details,
  });

  const report: AnalysisReport = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    target: config.target,
    ...(process.env.GITHUB_SHA ? { revision: process.env.GITHUB_SHA } : {}),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    summary: summary(findings, playwright.scenarios),
    adapters,
    scenarios: playwright.scenarios,
    findings,
  };

  await writeBundle(report, options.outputDir);
  return report;
}
