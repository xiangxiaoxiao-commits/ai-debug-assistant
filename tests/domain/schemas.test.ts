import { describe, it, expect } from 'vitest';
import {
  caseProblemSchema,
  createCaseInputSchema,
  addEvidenceInputSchema,
  pipelineStateSchema
} from '@/domain/schemas';
import { STEP_NAMES } from '@/domain/constants';

describe('caseProblemSchema', () => {
  it('拒绝空必填字段', () => {
    const r = caseProblemSchema.safeParse({ actual: '', expected: 'x', entry: 'x', environment: 'x' });
    expect(r.success).toBe(false);
  });
  it('接受完整四要素', () => {
    const r = caseProblemSchema.safeParse({
      actual: '页面显示数字', expected: '显示中文', entry: 'PLJI-1', environment: 'dev'
    });
    expect(r.success).toBe(true);
  });
});

describe('createCaseInputSchema', () => {
  it('meta 可选', () => {
    const r = createCaseInputSchema.safeParse({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    expect(r.success).toBe(true);
  });
});

describe('addEvidenceInputSchema', () => {
  it('拒绝非法证据类型', () => {
    const r = addEvidenceInputSchema.safeParse({ type: 'unknown-type', content: 'x' });
    expect(r.success).toBe(false);
  });
  it('接受 curl 类型', () => {
    const r = addEvidenceInputSchema.safeParse({ type: 'curl', content: 'curl http://x' });
    expect(r.success).toBe(true);
  });
});

describe('pipelineStateSchema', () => {
  it('要求 steps 长度 = 8', () => {
    const short = { currentStep: 'Normalize', steps: [], runIds: [] };
    expect(pipelineStateSchema.safeParse(short).success).toBe(false);
  });
  it('接受完整 8 步 waiting 状态', () => {
    const state = {
      currentStep: 'Normalize' as const,
      steps: STEP_NAMES.map((step) => ({ step, status: 'waiting' as const })),
      runIds: []
    };
    expect(pipelineStateSchema.safeParse(state).success).toBe(true);
  });
});
