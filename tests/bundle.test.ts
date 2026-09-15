import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSummary } from '../src/bundle.js';
import type { AnalysisReport } from '../src/model.js';

test('renders a compact markdown summary', () => {
  const report: AnalysisReport = {
    schemaVersion: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    target: { name: 'Example', baseUrl: 'https://example.com' },
    environment: { node: 'v22', platform: 'linux', arch: 'x64' },
    summary: { errors: 1, warnings: 2, info: 0, scenariosPassed: 3, scenariosFailed: 1 },
    adapters: [{ name: 'playwright', status: 'failed', durationMs: 5 }],
    scenarios: [],
    findings: [{ id: 'x', source: 'playwright', severity: 'error', title: 'Overflow' }],
  };

  const markdown = renderSummary(report);
  assert.match(markdown, /Errors: 1/);
  assert.match(markdown, /\[error\] Overflow/);
});
