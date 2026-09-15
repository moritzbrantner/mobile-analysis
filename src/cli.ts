#!/usr/bin/env node
import process from 'node:process';
import { analyzeMobile } from './analyze.js';
import { loadConfig } from './config.js';

interface Args {
  config: string;
  outputDir: string;
  targetUrl?: string;
  skipUnlighthouse: boolean;
  runMaestro: boolean;
  noFail: boolean;
}

function usage(): never {
  console.error('Usage: mobile-analysis analyze --config <file> [--target-url <url>] [--out <dir>] [--skip-unlighthouse] [--run-maestro] [--no-fail]');
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  if (argv[0] !== 'analyze') usage();
  const result: Args = {
    config: 'mobile-analysis.config.json',
    outputDir: 'mobile-analysis-output',
    skipUnlighthouse: false,
    runMaestro: false,
    noFail: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--config': result.config = argv[++index] ?? usage(); break;
      case '--out': result.outputDir = argv[++index] ?? usage(); break;
      case '--target-url': result.targetUrl = argv[++index] ?? usage(); break;
      case '--skip-unlighthouse': result.skipUnlighthouse = true; break;
      case '--run-maestro': result.runMaestro = true; break;
      case '--no-fail': result.noFail = true; break;
      default: usage();
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig(args.config, args.targetUrl);
const report = await analyzeMobile(config, {
  outputDir: args.outputDir,
  skipUnlighthouse: args.skipUnlighthouse,
  runMaestro: args.runMaestro,
});

console.log(`mobile-analysis: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);
if (!args.noFail && report.summary.errors > 0) process.exitCode = 1;
