import { describe, it, expect } from 'vitest';
import { buildAnalyzePrompt } from '@/server/prompt-builder';
import type { CaseProblem, CaseMeta, Evidence } from '@/domain/types';

function makeProblem(overrides?: Partial<CaseProblem>): CaseProblem {
  return {
    actual: '接口返回 500',
    expected: '返回 200 和用户列表',
    entry: 'GET /api/users',
    environment: 'production',
    ...overrides
  };
}

function makeMeta(overrides?: Partial<CaseMeta>): CaseMeta {
  return {
    module: 'user-service',
    repoPath: '/home/user/project',
    ...overrides
  };
}

function makeEvidence(n: number): Evidence {
  const id = `ev-${n}`;
  return {
    id,
    caseId: 'case-1',
    type: 'log',
    createdAt: new Date().toISOString(),
    source: 'user-paste',
    raw: {
      content: `ERROR NullPointerException at UserService.java:${n * 10}`,
      sizeBytes: 50
    },
    summary: {
      oneLine: `[log] ERROR NullPointerException at UserService.java:${n * 10}`,
      keywords: ['NullPointerException', 'UserService'],
      tokensEstimate: 15
    }
  };
}

describe('buildAnalyzePrompt', () => {
  it('contains all required markdown sections in system prompt', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: [] });

    expect(opts.systemPrompt).toContain('一句话结论');
    expect(opts.systemPrompt).toContain('已确认的事实');
    expect(opts.systemPrompt).toContain('推断的根因');
    expect(opts.systemPrompt).toContain('建议的验证步骤');
    expect(opts.systemPrompt).toContain('建议的修复方案');
    expect(opts.systemPrompt).toContain('还需要什么信息');
  });

  it('user prompt contains problem fields', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), meta: makeMeta(), evidences: [] });

    expect(opts.userPrompt).toContain('接口返回 500');
    expect(opts.userPrompt).toContain('返回 200 和用户列表');
    expect(opts.userPrompt).toContain('GET /api/users');
    expect(opts.userPrompt).toContain('production');
    expect(opts.userPrompt).toContain('user-service');
  });

  it('includes evidence content in user prompt', () => {
    const evidences = [makeEvidence(1), makeEvidence(2)];
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences });

    expect(opts.userPrompt).toContain('证据 1');
    expect(opts.userPrompt).toContain('证据 2');
    expect(opts.userPrompt).toContain('NullPointerException');
  });

  it('no evidence section shows placeholder', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: [] });

    expect(opts.userPrompt).toContain('无证据');
  });

  it('shows (未指定) when meta is absent', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: [] });

    expect(opts.userPrompt).toContain('(未指定)');
  });

  it('omits evidence when total prompt chars would exceed cap', () => {
    // Create many large evidences to force omission
    const bigEvidences: Evidence[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ev-${i}`,
      caseId: 'case-1',
      type: 'log' as const,
      createdAt: new Date().toISOString(),
      source: 'user-paste' as const,
      raw: { content: 'x'.repeat(4000), sizeBytes: 4000 },
      summary: {
        oneLine: `[log] big evidence ${i}`,
        keywords: [],
        tokensEstimate: 1000
      }
    }));

    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: bigEvidences });
    const totalChars = opts.userPrompt.length + opts.systemPrompt.length;

    // Total should be bounded (under 60k with reasonable margin)
    expect(totalChars).toBeLessThan(60_000);
    // Omission note should appear when items are dropped
    if (bigEvidences.length > 5) {
      // Some evidence should have been omitted
      expect(opts.userPrompt).toContain('已省略');
    }
  });

  it('includes code context section when code is provided', () => {
    const opts = buildAnalyzePrompt({
      problem: makeProblem(),
      evidences: [],
      code: {
        repoRoot: '/home/user/project',
        branch: 'main',
        commit: 'abc123',
        snippets: [{
          path: 'src/UserService.java',
          content: 'public class UserService {}',
          matched: ['UserService'],
          totalBytes: 26
        }],
        skipped: 0,
        warnings: []
      }
    });

    expect(opts.userPrompt).toContain('src/UserService.java');
    expect(opts.userPrompt).toContain('main');
    expect(opts.userPrompt).toContain('abc123');
    expect(opts.userPrompt).toContain('UserService');
  });

  it('shows code placeholder when no code provided', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: [] });

    expect(opts.userPrompt).toContain('未提供代码上下文');
  });

  it('uses default maxTokens and temperature via LlmCallOptions', () => {
    const opts = buildAnalyzePrompt({ problem: makeProblem(), evidences: [] });

    // buildAnalyzePrompt does not set these; they default in streamLlm
    expect(opts.maxTokens).toBeUndefined();
    expect(opts.temperature).toBeUndefined();
  });
});
