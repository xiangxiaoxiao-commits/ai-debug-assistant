import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as postCase, GET as listCasesRoute } from '@/app/api/cases/route';
import { GET as getCaseRoute, DELETE as deleteCaseRoute } from '@/app/api/cases/[id]/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-api-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api');
}

describe('cases API', () => {
  it('POST 校验失败 → 400', async () => {
    const res = await postCase(jsonReq({ problem: { actual: '', expected: 'b', entry: 'c', environment: 'd' } }));
    expect(res.status).toBe(400);
  });

  it('POST 成功 → 201 + case + 写入 index', async () => {
    const res = await postCase(jsonReq({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.id).toMatch(/^[0-9a-f-]{36}$/);

    const listRes = await listCasesRoute();
    const listBody = await listRes.json();
    expect(listBody.cases).toHaveLength(1);
    expect(listBody.cases[0].id).toBe(body.case.id);
  });

  it('GET /:id 返回 case + evidence', async () => {
    const created = await (await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }))).json();
    const res = await getCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.id).toBe(created.case.id);
    expect(body.evidence).toEqual([]);
  });

  it('DELETE /:id', async () => {
    const created = await (await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }))).json();
    const res = await deleteCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(res.status).toBe(200);

    const after = await getCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(after.status).toBe(404);
  });
});
