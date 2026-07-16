import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { GET, PUT, PATCH } from '@/app/api/cases/[id]/playbook/route';
import { createCase, updatePlaybook } from '@/server/case-store';
import type { Playbook } from '@/domain/types';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-pb-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function makePlaybook(): Playbook {
  const now = new Date().toISOString();
  return {
    steps: [
      { id: 'step-1', order: 1, title: '抓接口 cURL', status: 'todo', updatedAt: now, updatedBy: 'llm' },
      { id: 'step-2', order: 2, title: '检查数据库', status: 'todo', updatedAt: now, updatedBy: 'llm' }
    ],
    source: 'auto',
    updatedAt: now
  };
}

function req(method: string, id: string, body?: unknown): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/playbook`, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
}

describe('GET /api/cases/:id/playbook', () => {
  it('返回 404 当 case 不存在', async () => {
    const res = await GET(req('GET', '00000000-0000-0000-0000-000000000000'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' })
    });
    expect(res.status).toBe(404);
  });

  it('新 case 没有 playbook → 返回 null', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const res = await GET(req('GET', kase.id), { params: Promise.resolve({ id: kase.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playbook).toBeNull();
  });

  it('有 playbook → 返回', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await updatePlaybook(kase.id, makePlaybook());
    const res = await GET(req('GET', kase.id), { params: Promise.resolve({ id: kase.id }) });
    const body = await res.json();
    expect(body.playbook.steps).toHaveLength(2);
  });
});

describe('PUT /api/cases/:id/playbook', () => {
  it('替换 playbook steps，source 设为 user', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const now = new Date().toISOString();
    const steps = [
      { id: 'step-new', order: 1, title: '新步骤', status: 'todo' as const, updatedAt: now, updatedBy: 'user' as const }
    ];
    const res = await PUT(req('PUT', kase.id, { steps }), { params: Promise.resolve({ id: kase.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playbook.source).toBe('user');
    expect(body.playbook.steps[0].title).toBe('新步骤');
    expect(body.playbook.steps[0].updatedBy).toBe('user');
  });

  it('校验失败 → 400', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const res = await PUT(req('PUT', kase.id, { steps: 'not-an-array' }), {
      params: Promise.resolve({ id: kase.id })
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/cases/:id/playbook', () => {
  it('更新单步骤状态', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await updatePlaybook(kase.id, makePlaybook());

    const res = await PATCH(req('PATCH', kase.id, { stepId: 'step-1', patch: { status: 'done', notes: '完成' } }), {
      params: Promise.resolve({ id: kase.id })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const s1 = body.playbook.steps.find((s: { id: string }) => s.id === 'step-1');
    expect(s1.status).toBe('done');
    expect(s1.notes).toBe('完成');
    expect(s1.updatedBy).toBe('user');
  });

  it('stepId 不存在 → 404', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await updatePlaybook(kase.id, makePlaybook());

    const res = await PATCH(req('PATCH', kase.id, { stepId: 'nonexistent', patch: { status: 'done' } }), {
      params: Promise.resolve({ id: kase.id })
    });
    expect(res.status).toBe(404);
  });

  it('没有 playbook → 404', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const res = await PATCH(req('PATCH', kase.id, { stepId: 'step-1', patch: { status: 'done' } }), {
      params: Promise.resolve({ id: kase.id })
    });
    expect(res.status).toBe(404);
  });
});
