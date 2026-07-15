import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createCase,
  getCase,
  listCases,
  deleteCase,
  appendMessage,
  updateSummary,
  updateCaseStatus
} from '@/server/case-store';
import type { BugSummary } from '@/domain/types';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-store-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('case-store', () => {
  const input = {
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
    meta: { module: 'billing', repoPath: '/tmp/repo' }
  };

  it('createCase 生成 uuid + 落盘', async () => {
    const c = await createCase(input);
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.status).toBe('draft');
    expect(c.evidenceLevel).toBe('L0');
    expect(c.pipeline.steps).toHaveLength(8);
    expect(c.pipeline.steps.every(s => s.status === 'waiting')).toBe(true);

    const raw = await fs.readFile(path.join(tmp, 'cases', c.id, 'case.json'), 'utf8');
    expect(JSON.parse(raw).id).toBe(c.id);
  });

  it('getCase 回读', async () => {
    const c = await createCase(input);
    const back = await getCase(c.id);
    expect(back.id).toBe(c.id);
    expect(back.problem.actual).toBe('a');
  });

  it('getCase 不存在 → 抛错', async () => {
    await expect(getCase('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  it('listCases 返回全部 draft', async () => {
    const a = await createCase(input);
    const b = await createCase(input);
    const list = await listCases();
    const ids = list.map(x => x.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('deleteCase 移除目录', async () => {
    const c = await createCase(input);
    await deleteCase(c.id);
    await expect(getCase(c.id)).rejects.toThrow();
  });
});

describe('case-store — backward compat', () => {
  const input = {
    problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
  };

  it('老 case（无 messages/summary）→ getCase 返回归一化结果', async () => {
    const c = await createCase(input);
    // Simulate old case.json without messages/summary by writing raw file
    const filePath = path.join(tmp, 'cases', c.id, 'case.json');
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    delete raw.messages;
    delete raw.summary;
    await fs.writeFile(filePath, JSON.stringify(raw));

    const back = await getCase(c.id);
    expect(back.messages).toEqual([]);
    expect(back.summary?.status).toBe('open');
    expect(back.summary?.updatedBy).toBe('user');
  });
});

describe('appendMessage', () => {
  const input = {
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
  };

  it('追加消息并落盘', async () => {
    const c = await createCase(input);
    const msg = await appendMessage(c.id, { role: 'user', content: '第一条消息' });

    expect(msg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('第一条消息');
    expect(msg.createdAt).toBeTruthy();

    const back = await getCase(c.id);
    expect(back.messages).toHaveLength(1);
    expect(back.messages![0].id).toBe(msg.id);
  });

  it('顺序追加多条消息', async () => {
    const c = await createCase(input);
    await appendMessage(c.id, { role: 'user', content: 'msg1' });
    await appendMessage(c.id, { role: 'assistant', content: 'reply1' });

    const back = await getCase(c.id);
    expect(back.messages).toHaveLength(2);
    expect(back.messages![0].role).toBe('user');
    expect(back.messages![1].role).toBe('assistant');
  });

  it('携带 meta 字段', async () => {
    const c = await createCase(input);
    const msg = await appendMessage(c.id, {
      role: 'assistant',
      content: 'reply',
      meta: { inputTokens: 100, outputTokens: 50, durationMs: 1200 }
    });

    const back = await getCase(c.id);
    expect(back.messages![0].meta?.inputTokens).toBe(100);
    expect(msg.meta?.outputTokens).toBe(50);
  });
});

describe('updateSummary', () => {
  const input = {
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
  };

  it('设置 summary 并落盘', async () => {
    const c = await createCase(input);
    const summary: BugSummary = {
      status: 'investigating',
      headline: 'NPE in UserService',
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    };
    await updateSummary(c.id, summary);

    const back = await getCase(c.id);
    expect(back.summary?.status).toBe('investigating');
    expect(back.summary?.headline).toBe('NPE in UserService');
    expect(back.summary?.updatedBy).toBe('llm');
  });

  it('覆盖已有 summary', async () => {
    const c = await createCase(input);
    await updateSummary(c.id, {
      status: 'investigating',
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    });
    await updateSummary(c.id, {
      status: 'resolved',
      headline: 'Fixed',
      updatedAt: new Date().toISOString(),
      updatedBy: 'user'
    });

    const back = await getCase(c.id);
    expect(back.summary?.status).toBe('resolved');
    expect(back.summary?.headline).toBe('Fixed');
  });
});

describe('updateCaseStatus', () => {
  const input = {
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
  };

  it('resolved → case.status = done', async () => {
    const c = await createCase(input);
    await updateCaseStatus(c.id, 'resolved');

    const back = await getCase(c.id);
    expect(back.summary?.status).toBe('resolved');
    expect(back.status).toBe('done');
  });

  it('wont-fix → case.status = done', async () => {
    const c = await createCase(input);
    await updateCaseStatus(c.id, 'wont-fix');

    const back = await getCase(c.id);
    expect(back.status).toBe('done');
  });

  it('investigating → case.status = running', async () => {
    const c = await createCase(input);
    await updateCaseStatus(c.id, 'investigating');

    const back = await getCase(c.id);
    expect(back.status).toBe('running');
    expect(back.summary?.status).toBe('investigating');
    expect(back.summary?.updatedBy).toBe('user');
  });
});
