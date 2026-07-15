import { describe, it, expect } from 'vitest';
import {
  caseProblemSchema,
  createCaseInputSchema,
  addEvidenceInputSchema,
  pipelineStateSchema,
  bugSummarySchema,
  messageSchema,
  caseSchema,
  caseIndexEntrySchema
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

describe('bugSummarySchema', () => {
  it('接受最小必填字段', () => {
    const r = bugSummarySchema.safeParse({
      status: 'open',
      updatedAt: new Date().toISOString(),
      updatedBy: 'user'
    });
    expect(r.success).toBe(true);
  });

  it('接受全部字段', () => {
    const r = bugSummarySchema.safeParse({
      status: 'resolved',
      headline: '服务崩溃',
      rootCause: 'NPE',
      fixApproach: '加 null 检查',
      verified: true,
      verificationNotes: '复现后修复',
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    });
    expect(r.success).toBe(true);
  });

  it('拒绝非法 status', () => {
    const r = bugSummarySchema.safeParse({
      status: 'unknown',
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    });
    expect(r.success).toBe(false);
  });
});

describe('messageSchema', () => {
  it('接受 user 角色消息', () => {
    const r = messageSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      role: 'user',
      createdAt: new Date().toISOString(),
      content: '测试消息'
    });
    expect(r.success).toBe(true);
  });

  it('接受 system-summary 角色', () => {
    const r = messageSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000002',
      role: 'system-summary',
      createdAt: new Date().toISOString(),
      content: '背景摘要内容'
    });
    expect(r.success).toBe(true);
  });

  it('接受带 ingested 字段的消息', () => {
    const r = messageSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000003',
      role: 'user',
      createdAt: new Date().toISOString(),
      content: 'text',
      ingested: { evidenceIds: ['ev-1', 'ev-2'] }
    });
    expect(r.success).toBe(true);
  });
});

describe('caseSchema — Phase 3 optional fields', () => {
  function baseCase() {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft' as const,
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
      evidenceLevel: 'L0' as const,
      pipeline: {
        currentStep: 'Normalize' as const,
        steps: STEP_NAMES.map(step => ({ step, status: 'waiting' as const })),
        runIds: []
      }
    };
  }

  it('老 case.json（无 messages/summary）仍可解析', () => {
    const r = caseSchema.safeParse(baseCase());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.messages).toBeUndefined();
      expect(r.data.summary).toBeUndefined();
    }
  });

  it('带 messages 和 summary 的 case 可解析', () => {
    const r = caseSchema.safeParse({
      ...baseCase(),
      messages: [{
        id: '00000000-0000-0000-0000-000000000002',
        role: 'user',
        createdAt: new Date().toISOString(),
        content: '测试'
      }],
      summary: {
        status: 'investigating',
        updatedAt: new Date().toISOString(),
        updatedBy: 'llm'
      }
    });
    expect(r.success).toBe(true);
  });
});

describe('caseIndexEntrySchema — Phase 3 optional fields', () => {
  it('老索引条目（无 bugStatus/headline）仍可解析', () => {
    const r = caseIndexEntrySchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft'
    });
    expect(r.success).toBe(true);
  });

  it('带 bugStatus 和 headline 可解析', () => {
    const r = caseIndexEntrySchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'running',
      bugStatus: 'investigating',
      headline: '接口 500 错误'
    });
    expect(r.success).toBe(true);
  });
});
