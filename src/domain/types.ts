import type { STEP_NAMES, STEP_STATUSES, CASE_STATUSES, EVIDENCE_TYPES, EVIDENCE_LEVELS } from './constants';

// ─── Trace ────────────────────────────────────────────────────────────────────

export interface TraceStep {
  id: string;
  kind:
    | 'classify-feature'
    | 'find-similar'
    | 'load-knowledge'
    | 'quick-ingest'
    | 'read-code'
    | 'build-prompt'
    | 'llm-call'
    | 'extract-summary'
    | 'extract-lesson'
    | 'refresh-knowledge'
    | 'update-playbook';
  label: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: 'ok' | 'skipped' | 'failed';
  detail?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  caseId: string;
  triggeredBy: 'create-case' | 'send-message' | 'change-status' | 'refresh-knowledge';
  triggerRef?: string;
  createdAt: string;
  totalMs: number;
  steps: TraceStep[];
}

// ─── Playbook ─────────────────────────────────────────────────────────────────

export interface PlaybookStep {
  id: string;
  order: number;
  title: string;
  hint?: string;
  status: 'todo' | 'doing' | 'done' | 'skipped';
  evidenceRefs?: string[];
  notes?: string;
  updatedAt: string;
  updatedBy: 'user' | 'llm';
}

export interface Playbook {
  steps: PlaybookStep[];
  source: 'auto' | 'user' | 'template';
  updatedAt: string;
}

export type StepName = (typeof STEP_NAMES)[number];
export type StepStatus = (typeof STEP_STATUSES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export type BugStatus = 'open' | 'investigating' | 'resolved' | 'wont-fix';

export interface BugSummary {
  status: BugStatus;
  headline?: string;
  rootCause?: string;
  fixApproach?: string;
  verified?: boolean;
  verificationNotes?: string;
  updatedAt: string;
  updatedBy: 'llm' | 'user';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system-summary';
  createdAt: string;
  content: string;
  ingested?: { evidenceIds: string[] };
  meta?: { inputTokens?: number; outputTokens?: number; durationMs?: number };
}

export interface PipelineStep {
  step: StepName;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  inputHash?: string;
  outputRef?: string;
  blockedReason?: {
    kind: 'need-evidence' | 'provider-error';
    detail: string;
    suggestedActions: string[];
  };
  error?: { code: string; message: string };
}

export interface PipelineState {
  currentStep: StepName;
  steps: PipelineStep[];
  runIds: string[];
}

export interface CaseProblem {
  actual: string;
  expected: string;
  entry: string;
  environment: string;
}

export interface CaseMeta {
  occurredAt?: string;
  affectedUser?: string;
  module?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  branch?: string;
  commit?: string;
  repoPath?: string;
}

export interface Case {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  problem: CaseProblem;
  meta?: CaseMeta;
  classification?: {
    category: string;
    subCategory?: string;
    confidence: 'low' | 'medium' | 'high';
    matchedRuleIds: string[];
  };
  evidenceLevel: EvidenceLevel;
  pipeline: PipelineState;
  reportId?: string;
  modelSnapshot?: { provider: string; baseUrl: string; model: string };
  messages?: Message[];
  summary?: BugSummary;
  featureId?: string;
  relatedCaseIds?: string[];
  lessons?: Lesson;
  playbook?: Playbook;
  traceIds?: string[];
}

export interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  createdAt: string;
  source: 'user-paste' | 'user-upload' | 'provider' | 'llm-generated';
  raw: { content: string; filename?: string; sizeBytes: number };
  parsed?: unknown;
  summary: { oneLine: string; keywords: string[]; tokensEstimate: number };
  sanitized?: { content: string; redactedKeys: string[] };
}

export interface CaseIndexEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  repoPath?: string;
  status: CaseStatus;
  bugStatus?: BugStatus;
  headline?: string;
  featureId?: string;
  featureName?: string;
}

export interface VerifiedFix {
  symptomPattern: string;
  rootCause: string;
  fix: string;
  sourceCaseIds: string[];
}

export interface FeatureKnowledge {
  commonRootCauses: string[];
  verifiedFixes: VerifiedFix[];
  updatedAt: string;
  sourceCaseCount: number;
}

export interface Feature {
  id: string;
  name: string;
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
  bugCount: number;
  resolvedCount: number;
  knowledge?: FeatureKnowledge;
}

export interface Lesson {
  symptomPattern: string;
  rootCause: string;
  fix: string;
  extractedAt: string;
}
