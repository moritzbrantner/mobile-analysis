import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildAgentFindings } from '../src/agent-findings.js';
import { writeBundle } from '../src/bundle.js';
import type { AnalysisReport } from '../src/model.js';

function report(sourceFindingId = 'scenario:pixel:settings'): AnalysisReport {
  return {
    schemaVersion: 1,
    createdAt: '2026-09-16T00:00:00.000Z',
    target: { name: 'Example', baseUrl: 'https://example.com/app/' },
    revision: 'abc123',
    environment: { node: 'v22', platform: 'linux', arch: 'x64' },
    summary: { errors: 1, warnings: 1, info: 0, scenariosPassed: 0, scenariosFailed: 1 },
    adapters: [{ name: 'playwright', status: 'failed', durationMs: 5 }],
    scenarios: [
      {
        scenarioId: 'settings',
        scenarioName: 'Open settings',
        deviceId: 'pixel',
        status: 'failed',
        durationMs: 5,
        url: 'https://example.com/app/',
        screenshot: 'screenshots/pixel-settings-final.png',
      },
    ],
    findings: [
      {
        id: sourceFindingId,
        source: 'playwright',
        severity: 'error',
        title: 'Scenario failed: Open settings',
        details: 'Settings button was not visible',
        deviceId: 'pixel',
        scenarioId: 'settings',
        url: 'https://example.com/app/',
        artifact: 'screenshots/pixel-settings-final.png',
      },
      {
        id: 'small-touch-targets:pixel:settings',
        source: 'playwright',
        severity: 'warning',
        title: '1 small interactive target(s) found',
        details: 'Save: 28x28',
        deviceId: 'pixel',
        scenarioId: 'settings',
        url: 'https://example.com/app/',
      },
    ],
  };
}

test('builds deterministic agent-facing findings with explicit context and evidence', () => {
  const first = buildAgentFindings(report());
  const second = buildAgentFindings(report('scenario:pixel:settings:transient-sequence'));

  assert.equal(first.schemaVersion, 1);
  assert.equal(first.producer, 'mobile-analysis');
  assert.equal(first.findings[0]?.category, 'interaction');
  assert.equal(first.findings[0]?.reproducibility, 'deterministic');
  assert.equal(first.findings[0]?.id, second.findings[0]?.id);
  assert.deepEqual(first.findings[0]?.context, {
    deviceId: 'pixel',
    scenarioId: 'settings',
    url: 'https://example.com/app/',
  });
  assert.deepEqual(first.findings[0]?.evidence, [
    { kind: 'artifact', value: 'screenshots/pixel-settings-final.png' },
    { kind: 'screenshot', value: 'screenshots/pixel-settings-final.png' },
    { kind: 'url', value: 'https://example.com/app/' },
  ]);
  assert.equal(first.findings[1]?.category, 'accessibility');
  assert.equal(first.findings[1]?.reproducibility, 'advisory');
});

test('writes the agent contract into the portable evidence bundle and manifest', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'mobile-analysis-agent-findings-'));
  try {
    await writeBundle(report(), outputDir);
    const contract = JSON.parse(await readFile(join(outputDir, 'agent-findings.json'), 'utf8')) as {
      schemaVersion: number;
      findings: unknown[];
    };
    const manifest = await readFile(join(outputDir, 'manifest.sha256'), 'utf8');

    assert.equal(contract.schemaVersion, 1);
    assert.equal(contract.findings.length, 2);
    assert.match(manifest, /  agent-findings\.json$/m);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
