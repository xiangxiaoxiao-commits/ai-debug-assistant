export const STEP_NAMES = [
  'Normalize',
  'Classify',
  'CollectEvidence',
  'InspectAPI',
  'AnalyzeCode',
  'AnalyzeSchema',
  'Diagnose',
  'ProposeFix'
] as const;

export const STEP_STATUSES = ['waiting', 'ready', 'running', 'blocked', 'done', 'skipped'] as const;

export const CASE_STATUSES = ['draft', 'running', 'blocked', 'done', 'error'] as const;

export const EVIDENCE_TYPES = [
  'curl', 'har', 'log', 'schema-sql',
  'ticket-text', 'page-url', 'api-response',
  'repo-path', 'screenshot-note', 'free-text'
] as const;

export const EVIDENCE_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;

export const SCHEMA_VERSION = '1.0';
