import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { createCase, getCase } from '@/server/case-store';
import { PATCH } from '@/app/api/cases/[id]/status/route';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-status-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function patchReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('PATCH /api/cases/:id/status', () => {
  it('返回 400 when bad body', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    const res = await PATCH(patchReq(kase.id, { status: 'invalid-status' }), { params: { id: kase.id } });
    expect(res.status).toBe(400);
  });

  it('返回 404 when case not found', async () => {
    const res = await PATCH(
      patchReq('00000000-0000-0000-0000-000000000000', { status: 'resolved' }),
      { params: { id: '00000000-0000-0000-0000-000000000000' } }
    );
    expect(res.status).toBe(404);
  });

  it('resolved → summary.status=resolved, case.status=done', async () => {
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await PATCH(patchReq(kase.id, { status: 'resolved' }), { params: { id: kase.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.summary.status).toBe('resolved');

    const updated = await getCase(kase.id);
    expect(updated.status).toBe('done');
    expect(updated.summary?.status).toBe('resolved');
    expect(updated.summary?.updatedBy).toBe('user');
  });

  it('wont-fix → case.status=done', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    await PATCH(patchReq(kase.id, { status: 'wont-fix' }), { params: { id: kase.id } });

    const updated = await getCase(kase.id);
    expect(updated.status).toBe('done');
    expect(updated.summary?.status).toBe('wont-fix');
  });

  it('investigating → case.status=running', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    await PATCH(patchReq(kase.id, { status: 'investigating' }), { params: { id: kase.id } });

    const updated = await getCase(kase.id);
    expect(updated.status).toBe('running');
    expect(updated.summary?.status).toBe('investigating');
  });

  it('open → case.status 保持 draft', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    await PATCH(patchReq(kase.id, { status: 'open' }), { params: { id: kase.id } });

    const updated = await getCase(kase.id);
    expect(updated.summary?.status).toBe('open');
    expect(updated.status).toBe('draft');
  });

  it('携带 verificationNotes → 写入 summary', async () => {
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    await PATCH(
      patchReq(kase.id, { status: 'resolved', verificationNotes: '在生产环境验证，无复现' }),
      { params: { id: kase.id } }
    );

    const updated = await getCase(kase.id);
    expect(updated.summary?.verificationNotes).toBe('在生产环境验证，无复现');
  });

  it('状态转换：investigating → resolved', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    await PATCH(patchReq(kase.id, { status: 'investigating' }), { params: { id: kase.id } });
    await PATCH(patchReq(kase.id, { status: 'resolved' }), { params: { id: kase.id } });

    const updated = await getCase(kase.id);
    expect(updated.summary?.status).toBe('resolved');
    expect(updated.status).toBe('done');
  });
});
