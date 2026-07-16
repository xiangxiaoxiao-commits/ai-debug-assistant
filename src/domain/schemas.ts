import { z } from 'zod';
import { STEP_NAMES, STEP_STATUSES, CASE_STATUSES, EVIDENCE_TYPES, EVIDENCE_LEVELS } from './constants';

export const stepNameSchema = z.enum(STEP_NAMES);
export const stepStatusSchema = z.enum(STEP_STATUSES);
export const caseStatusSchema = z.enum(CASE_STATUSES);
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export const evidenceLevelSchema = z.enum(EVIDENCE_LEVELS);

// ─── Trace schemas ────────────────────────────────────────────────────────────

export const traceStepKindSchema = z.enum([
  'classify-feature', 'find-similar', 'load-knowledge', 'quick-ingest',
  'read-code', 'build-prompt', 'llm-call', 'extract-summary',
  'extract-lesson', 'refresh-knowledge', 'update-playbook'
]);

export const traceStepSchema = z.object({
  id: z.string(),
  kind: traceStepKindSchema,
  label: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['ok', 'skipped', 'failed']),
  detail: z.string().optional(),
  error: z.string().optional(),
  meta: z.record(z.unknown()).optional()
});

export const traceSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  triggeredBy: z.enum(['create-case', 'send-message', 'change-status', 'refresh-knowledge']),
  triggerRef: z.string().optional(),
  createdAt: z.string(),
  totalMs: z.number().nonnegative(),
  steps: z.array(traceStepSchema)
});

// ─── Playbook schemas ─────────────────────────────────────────────────────────

export const playbookStepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  hint: z.string().optional(),
  status: z.enum(['todo', 'doing', 'done', 'skipped']),
  evidenceRefs: z.array(z.string()).optional(),
  notes: z.string().optional(),
  updatedAt: z.string(),
  updatedBy: z.enum(['user', 'llm'])
});

export const playbookSchema = z.object({
  steps: z.array(playbookStepSchema),
  source: z.enum(['auto', 'user', 'template']),
  updatedAt: z.string()
});

export const bugStatusSchema = z.enum(['open', 'investigating', 'resolved', 'wont-fix']);

export const bugSummarySchema = z.object({
  status: bugStatusSchema,
  headline: z.string().optional(),
  rootCause: z.string().optional(),
  fixApproach: z.string().optional(),
  verified: z.boolean().optional(),
  verificationNotes: z.string().optional(),
  updatedAt: z.string(),
  updatedBy: z.enum(['llm', 'user'])
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system-summary']),
  createdAt: z.string(),
  content: z.string(),
  ingested: z.object({ evidenceIds: z.array(z.string()) }).optional(),
  meta: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    durationMs: z.number().optional()
  }).optional()
});

export const pipelineStepSchema = z.object({
  step: stepNameSchema,
  status: stepStatusSchema,
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  inputHash: z.string().optional(),
  outputRef: z.string().optional(),
  blockedReason: z.object({
    kind: z.enum(['need-evidence', 'provider-error']),
    detail: z.string(),
    suggestedActions: z.array(z.string())
  }).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional()
});

export const pipelineStateSchema = z.object({
  currentStep: stepNameSchema,
  steps: z.array(pipelineStepSchema).length(STEP_NAMES.length),
  runIds: z.array(z.string())
});

export const caseProblemSchema = z.object({
  actual: z.string().min(1, '必填'),
  expected: z.string().min(1, '必填'),
  entry: z.string().min(1, '必填'),
  environment: z.string().min(1, '必填')
});

export const caseMetaSchema = z.object({
  occurredAt: z.string().optional(),
  affectedUser: z.string().optional(),
  module: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  repoPath: z.string().optional()
});

export const lessonSchema = z.object({
  symptomPattern: z.string(),
  rootCause: z.string(),
  fix: z.string(),
  extractedAt: z.string()
});

export const caseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: caseStatusSchema,
  problem: caseProblemSchema,
  meta: caseMetaSchema.optional(),
  classification: z.object({
    category: z.string(),
    subCategory: z.string().optional(),
    confidence: z.enum(['low', 'medium', 'high']),
    matchedRuleIds: z.array(z.string())
  }).optional(),
  evidenceLevel: evidenceLevelSchema,
  pipeline: pipelineStateSchema,
  reportId: z.string().optional(),
  modelSnapshot: z.object({
    provider: z.string(), baseUrl: z.string(), model: z.string()
  }).optional(),
  messages: z.array(messageSchema).optional(),
  summary: bugSummarySchema.optional(),
  featureId: z.string().uuid().optional(),
  relatedCaseIds: z.array(z.string().uuid()).optional(),
  lessons: lessonSchema.optional(),
  playbook: playbookSchema.optional(),
  traceIds: z.array(z.string()).optional(),
  projectId: z.string().uuid().optional()
});

export const evidenceSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  type: evidenceTypeSchema,
  createdAt: z.string(),
  source: z.enum(['user-paste', 'user-upload', 'provider', 'llm-generated']),
  raw: z.object({
    content: z.string(),
    filename: z.string().optional(),
    sizeBytes: z.number().nonnegative()
  }),
  parsed: z.unknown().optional(),
  summary: z.object({
    oneLine: z.string(),
    keywords: z.array(z.string()),
    tokensEstimate: z.number().nonnegative()
  }),
  sanitized: z.object({
    content: z.string(),
    redactedKeys: z.array(z.string())
  }).optional()
});

export const createCaseInputSchema = z.object({
  problem: caseProblemSchema,
  meta: caseMetaSchema.optional()
});

export const addEvidenceInputSchema = z.object({
  type: evidenceTypeSchema,
  content: z.string().min(1),
  filename: z.string().optional()
});

export const caseIndexEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repoPath: z.string().optional(),
  status: caseStatusSchema,
  bugStatus: bugStatusSchema.optional(),
  headline: z.string().optional(),
  featureId: z.string().uuid().optional(),
  featureName: z.string().optional()
});

export const verifiedFixSchema = z.object({
  symptomPattern: z.string(),
  rootCause: z.string(),
  fix: z.string(),
  sourceCaseIds: z.array(z.string())
});

export const featureKnowledgeSchema = z.object({
  commonRootCauses: z.array(z.string()),
  verifiedFixes: z.array(verifiedFixSchema),
  updatedAt: z.string(),
  sourceCaseCount: z.number().nonnegative()
});

export const featureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  bugCount: z.number().nonnegative(),
  resolvedCount: z.number().nonnegative(),
  knowledge: featureKnowledgeSchema.optional()
});

export const featureIndexEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bugCount: z.number().nonnegative(),
  resolvedCount: z.number().nonnegative(),
  updatedAt: z.string()
});
