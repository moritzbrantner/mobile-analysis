import { createHash } from 'node:crypto';
import type { AnalysisReport, Finding, Severity } from './model.js';

export const agentFindingsSchemaVersion = 1 as const;

export type AgentFindingCategory =
  | 'interaction'
  | 'runtime'
  | 'network'
  | 'layout'
  | 'accessibility'
  | 'performance'
  | 'native'
  | 'tooling';

export type AgentFindingReproducibility = 'deterministic' | 'environment-dependent' | 'advisory';

export type AgentFindingEvidence = {
  kind: 'artifact' | 'screenshot' | 'url';
  value: string;
};

export interface AgentFinding {
  id: string;
  sourceFindingId: string;
  source: Finding['source'];
  category: AgentFindingCategory;
  severity: Severity;
  title: string;
  details?: string;
  reproducibility: AgentFindingReproducibility;
  context: {
    deviceId?: string;
    scenarioId?: string;
    url?: string;
  };
  evidence: AgentFindingEvidence[];
}

export interface AgentFindingsReport {
  schemaVersion: typeof agentFindingsSchemaVersion;
  producer: 'mobile-analysis';
  createdAt: string;
  target: AnalysisReport['target'];
  revision?: string;
  findings: AgentFinding[];
}

const severityRank: Record<Severity, number> = {
  error: 0,
  warning: 10,
  info: 20,
};

function categoryFor(finding: Finding): AgentFindingCategory {
  if (finding.source === 'unlighthouse') return 'performance';
  if (finding.source === 'maestro') return 'native';
  if (finding.id.startsWith('horizontal-overflow:')) return 'layout';
  if (finding.id.startsWith('small-touch-targets:')) return 'accessibility';
  if (finding.id.startsWith('console:') || finding.id.startsWith('pageerror:')) return 'runtime';
  if (finding.id.startsWith('requestfailed:') || finding.id.startsWith('http:')) return 'network';
  if (finding.id.startsWith('scenario:')) return 'interaction';
  return 'tooling';
}

function reproducibilityFor(
  finding: Finding,
  category: AgentFindingCategory,
): AgentFindingReproducibility {
  if (finding.id.startsWith('small-touch-targets:')) return 'advisory';
  if (category === 'network' || category === 'performance' || finding.id === 'unlighthouse:not-installed') {
    return 'environment-dependent';
  }
  return 'deterministic';
}

function stableFindingId(finding: Finding, category: AgentFindingCategory): string {
  const digest = createHash('sha256')
    .update([
      finding.source,
      category,
      finding.severity,
      finding.title,
      finding.details ?? '',
      finding.deviceId ?? '',
      finding.scenarioId ?? '',
      finding.url ?? '',
      finding.artifact ?? '',
    ].join('\0'))
    .digest('hex');
  return `MA-${digest.slice(0, 12).toUpperCase()}`;
}

function evidenceFor(report: AnalysisReport, finding: Finding): AgentFindingEvidence[] {
  const evidence: AgentFindingEvidence[] = [];
  if (finding.artifact) evidence.push({ kind: 'artifact', value: finding.artifact });

  const scenario = report.scenarios.find(
    (result) =>
      result.scenarioId === finding.scenarioId &&
      (finding.deviceId === undefined || result.deviceId === finding.deviceId),
  );
  if (scenario?.screenshot) evidence.push({ kind: 'screenshot', value: scenario.screenshot });
  if (finding.url) evidence.push({ kind: 'url', value: finding.url });

  return [...new Map(evidence.map((item) => [`${item.kind}\0${item.value}`, item])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value));
}

export function buildAgentFindings(report: AnalysisReport): AgentFindingsReport {
  const findings = report.findings
    .map((finding): AgentFinding => {
      const category = categoryFor(finding);
      return {
        id: stableFindingId(finding, category),
        sourceFindingId: finding.id,
        source: finding.source,
        category,
        severity: finding.severity,
        title: finding.title,
        ...(finding.details ? { details: finding.details } : {}),
        reproducibility: reproducibilityFor(finding, category),
        context: {
          ...(finding.deviceId ? { deviceId: finding.deviceId } : {}),
          ...(finding.scenarioId ? { scenarioId: finding.scenarioId } : {}),
          ...(finding.url ? { url: finding.url } : {}),
        },
        evidence: evidenceFor(report, finding),
      };
    })
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity] ||
        left.category.localeCompare(right.category) ||
        left.id.localeCompare(right.id),
    );

  return {
    schemaVersion: agentFindingsSchemaVersion,
    producer: 'mobile-analysis',
    createdAt: report.createdAt,
    target: report.target,
    ...(report.revision ? { revision: report.revision } : {}),
    findings,
  };
}
