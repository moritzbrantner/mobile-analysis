import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { AnalysisReport } from './model.js';

async function filesRecursively(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...await filesRecursively(root, path));
    else result.push(path);
  }
  return result;
}

export function renderSummary(report: AnalysisReport): string {
  const lines = [
    `# Mobile analysis: ${report.target.name}`,
    '',
    `Target: ${report.target.baseUrl}`,
    report.revision ? `Revision: ${report.revision}` : undefined,
    `Created: ${report.createdAt}`,
    '',
    '## Result',
    '',
    `- Errors: ${report.summary.errors}`,
    `- Warnings: ${report.summary.warnings}`,
    `- Passed scenarios: ${report.summary.scenariosPassed}`,
    `- Failed scenarios: ${report.summary.scenariosFailed}`,
    '',
    '## Adapters',
    '',
    ...report.adapters.map((adapter) => `- ${adapter.name}: ${adapter.status} (${adapter.durationMs} ms)${adapter.details ? ` — ${adapter.details}` : ''}`),
    '',
    '## Findings',
    '',
    ...(report.findings.length === 0
      ? ['No findings.']
      : report.findings.map((finding) => `- [${finding.severity}] ${finding.title}${finding.deviceId ? ` (${finding.deviceId})` : ''}${finding.details ? ` — ${finding.details.replace(/\n/g, '; ')}` : ''}`)),
    '',
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}

export async function writeBundle(report: AnalysisReport, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'analysis.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'environment.json'), `${JSON.stringify(report.environment, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'summary.md'), renderSummary(report), 'utf8');

  const files = (await filesRecursively(outputDir))
    .filter((path) => !path.endsWith('manifest.sha256'))
    .sort();
  const manifest: string[] = [];
  for (const path of files) {
    const bytes = await readFile(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    manifest.push(`${hash}  ${relative(outputDir, path).replaceAll('\\', '/')}`);
  }
  await writeFile(join(outputDir, 'manifest.sha256'), `${manifest.join('\n')}\n`, 'utf8');
}
