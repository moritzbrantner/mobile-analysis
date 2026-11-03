import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMachine } from 'xstate';
import { normalizeConfig } from '../src/config.js';
import { runPlaywrightAnalysis } from '../src/playwright.js';
import { generateMachineScenarios } from '../src/state-machine.js';

const html = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>button{min-width:48px;min-height:48px}</style>
<button aria-label="Settings" onclick="document.querySelector('#preferences').hidden=false;document.querySelector('#closed').hidden=true">Settings</button>
<div id="closed">Settings closed</div>
<div role="checkbox" aria-label="Tiny option" style="width:28px;height:28px"></div>
<div id="preferences" hidden><span>Preferences</span> <button aria-label="Close" onclick="document.querySelector('#preferences').hidden=true;document.querySelector('#closed').hidden=false">Close</button></div>`;

test('executes the same mobile flow on Chromium and WebKit', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const outputDir = await mkdtemp(join(tmpdir(), 'mobile-analysis-'));

  try {
    const generated = generateMachineScenarios({
      id: 'settings', name: 'Open and close settings', path: '/',
      model: createMachine({
        id: 'settings', initial: 'closed', states: {
          closed: { on: { OPEN: 'open' } },
          open: { on: { CLOSE: 'closed' } },
        },
      }),
      actions: {
        OPEN: [{ action: 'tap', target: { role: 'button', name: 'Settings' } }],
        CLOSE: [{ action: 'tap', target: { role: 'button', name: 'Close' } }],
      },
      assertions: {
        closed: [{ action: 'expectVisible', target: { text: 'Settings closed' } }],
        open: [{ action: 'expectVisible', target: { text: 'Preferences' } }],
      },
    });
    assert.deepEqual(generated.coverage.transitions, [
      'closed --OPEN--> open',
      'open --CLOSE--> closed',
    ]);

    const config = normalizeConfig({
      target: { name: 'Fixture', baseUrl: `http://127.0.0.1:${address.port}` },
      routes: ['/'],
      unlighthouse: { enabled: false, budget: 80 },
      scenarios: generated.scenarios,
    });

    const result = await runPlaywrightAnalysis(config, outputDir);
    assert.equal(result.status, 'passed');
    assert.equal(result.scenarios.length, 2 * (1 + generated.scenarios.length));
    assert.equal(result.scenarios.filter((scenario) => scenario.status === 'failed').length, 0);
    assert.equal(result.findings.filter((finding) => finding.severity === 'error').length, 0);
    assert.ok(
      result.findings.some(
        (finding) => finding.title.includes('small interactive target')
          && finding.details?.includes('Tiny option: 28x28') === true,
      ),
      'expected ARIA checkbox to be inspected as a touch target',
    );

    const screenshots = await readdir(join(outputDir, 'screenshots'));
    assert.equal(screenshots.filter((name) => name.endsWith('-final.png')).length, result.scenarios.length);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test('fails the Playwright adapter when error findings occur without a scenario exception', async () => {
  const errorHtml = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<div style="width: 2000px">Overflow fixture</div>
<script>
  fetch('/drop').catch(() => {});
  setTimeout(() => { throw new Error('fixture page error'); }, 0);
</script>`;

  const server = createServer((request, response) => {
    if (request.url === '/drop') {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(errorHtml);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const outputDir = await mkdtemp(join(tmpdir(), 'mobile-analysis-errors-'));

  try {
    const config = normalizeConfig({
      target: { name: 'Error fixture', baseUrl: `http://127.0.0.1:${address.port}` },
      routes: [],
      devices: [{
        id: 'chromium-phone',
        name: 'Chromium phone',
        browser: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      }],
      unlighthouse: { enabled: false, budget: 80 },
      scenarios: [{
        id: 'errors',
        name: 'Collect runtime errors',
        path: '/',
        steps: [{ action: 'wait', ms: 200 }],
      }],
    });

    const result = await runPlaywrightAnalysis(config, outputDir);

    assert.equal(result.scenarios.length, 1);
    assert.equal(result.scenarios[0]?.status, 'passed');
    assert.equal(result.status, 'failed');
    assert.ok(result.findings.some((finding) => finding.id.startsWith('horizontal-overflow:')));
    assert.ok(result.findings.some((finding) => finding.id.startsWith('pageerror:')));
    assert.ok(result.findings.some((finding) => finding.id.startsWith('requestfailed:')));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
