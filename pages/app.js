const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);

function render(report) {
  byId('summary').textContent = `${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.scenariosPassed} scenario run(s) passed, ${report.summary.scenariosFailed} failed.`;
  byId('environment').innerHTML = [
    ['Target', report.target?.baseUrl],
    ['Revision', report.revision ?? '—'],
    ['Created', report.createdAt],
    ['Environment', `${report.environment?.platform ?? '?'} / ${report.environment?.arch ?? '?'} / ${report.environment?.node ?? '?'}`],
  ].map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join('');

  byId('scenarios').innerHTML = (report.scenarios ?? []).map((scenario) => `<tr>
    <td>${escapeHtml(scenario.scenarioName)}</td>
    <td>${escapeHtml(scenario.deviceId)}</td>
    <td class="status-${escapeHtml(scenario.status)}">${escapeHtml(scenario.status)}</td>
    <td>${escapeHtml(scenario.durationMs)} ms</td>
    <td><code>${escapeHtml(scenario.url)}</code></td>
  </tr>`).join('') || '<tr><td colspan="5">No scenarios.</td></tr>';

  byId('findings').innerHTML = (report.findings ?? []).map((finding) => `<tr>
    <td class="severity-${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</td>
    <td>${escapeHtml(finding.source)}</td>
    <td><strong>${escapeHtml(finding.title)}</strong><div class="details">${escapeHtml(finding.details ?? '')}</div></td>
    <td>${escapeHtml([finding.deviceId, finding.scenarioId].filter(Boolean).join(' / '))}</td>
  </tr>`).join('') || '<tr><td colspan="4">No findings.</td></tr>';
}

async function loadSample() {
  const response = await fetch('./sample-report.json');
  if (!response.ok) throw new Error(`Sample report returned HTTP ${response.status}`);
  render(await response.json());
}

byId('file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  render(JSON.parse(await file.text()));
});

loadSample().catch((error) => { byId('summary').textContent = error.message; });
