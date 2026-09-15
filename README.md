# mobile-analysis

Reusable mobile acceptance analysis for web and native applications. The repository turns mobile testing into portable evidence rather than a collection of repo-specific scripts.

## What it checks

- **Playwright mobile flows** on a WebKit/iPhone-sized viewport and a Chromium/Pixel-sized viewport.
- **Interaction scenarios** from one declarative configuration: tap, fill, press, visibility/text assertions, waits, and named screenshots.
- **Runtime failures** including JavaScript errors, failed requests, HTTP errors, horizontal overflow, and advisory small touch targets.
- **Unlighthouse** site-wide mobile audits with an explicit score budget.
- **Maestro** flow generation from the same scenarios, with optional execution against a connected native app.

Every run writes one portable bundle containing `analysis.json`, `summary.md`, `environment.json`, SHA-256 hashes, screenshots, Unlighthouse output, and generated Maestro flows.

## Install

```bash
npm install
npm run setup:browsers
npm run build
```

Unlighthouse is deliberately an external adapter. Install the pinned CI tooling when you want that layer:

```bash
npm install -g @unlighthouse/cli@0.18.0 puppeteer@25.11.0
```

Maestro is optional and only required for native execution. Follow the official Maestro installation instructions and make `maestro` available on `PATH`.

## Configure a consumer

Copy `mobile-analysis.config.example.json` to `mobile-analysis.config.json` and describe representative user journeys. The same scenario is executed on the mobile web device matrix and translated into a Maestro flow when native analysis is enabled.

```json
{
  "target": { "name": "My app", "baseUrl": "https://example.github.io/my-app/" },
  "routes": ["/"],
  "scenarios": [
    {
      "id": "settings",
      "name": "Open settings",
      "path": "/",
      "steps": [
        { "action": "tap", "target": { "role": "button", "name": "Settings" } },
        { "action": "expectVisible", "target": { "text": "Preferences" } }
      ]
    }
  ]
}
```

## Run

```bash
node dist/src/cli.js analyze --config mobile-analysis.config.json
```

Useful options:

- `--target-url <url>` overrides the configured deployment URL (useful for preview deployments).
- `--out <dir>` changes the evidence bundle directory.
- `--skip-unlighthouse` runs only interaction/native layers.
- `--run-maestro` executes generated native flows instead of only emitting them.
- `--no-fail` records errors without making the command exit non-zero.

The JavaScript API exposes the same boundary:

```ts
import { analyzeMobile, loadConfig } from 'mobile-analysis';

const config = await loadConfig('mobile-analysis.config.json');
await analyzeMobile(config, { outputDir: 'mobile-analysis-output' });
```

## GitHub Actions

The reusable workflow in `.github/workflows/analyze.yml` is designed for consumer repositories. It checks out the calling repository and this analyzer, installs pinned browser/audit tooling, executes the analysis against a deployed URL, and uploads the complete evidence bundle.

The Pages site in `pages/` is a static explorer for `analysis.json` bundles. It is intentionally a viewer, not an executor: browsers/emulators run in CI or locally; Pages visualizes their evidence.

## Architecture

```text
consumer config / scenarios
          |
          v
  mobile-analysis core
   |       |       |
Playwright |   Maestro
           |
      Unlighthouse
           |
           v
portable evidence bundle
           |
           v
 GitHub Pages explorer
```

The analysis contract is authoritative. Individual application repositories only own their scenarios and deployment/native setup; they should not reimplement report formats, device matrices, or evidence collection.
