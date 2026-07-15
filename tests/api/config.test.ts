import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-cfgapi-'));
  process.env.AI_DEBUG_HOME = tmp;
  // Set a known env key for discover/reveal tests
  process.env.OPENAI_API_KEY = 'sk-testtesttest';
  // Clear others
  for (const k of [
    'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY',
    'MOONSHOT_API_KEY', 'SILICONFLOW_API_KEY',
    'ZHIPU_API_KEY', 'GEMINI_API_KEY',
  ]) {
    delete process.env[k];
  }
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
  delete process.env.OPENAI_API_KEY;
});

function putReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/config/model', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/config/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/config/discover', () => {
  it('returns candidates array without full keys', async () => {
    const { GET } = await import('@/app/api/config/discover/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('sk-testtesttest');
    const c = body.candidates.find((x: { id: string }) => x.id === 'env:OPENAI_API_KEY');
    expect(c).toBeDefined();
    expect(c.apiKeyMasked).toBe('sk-t****test');
  });

  it('saved is null when no config persisted', async () => {
    const { GET } = await import('@/app/api/config/discover/route');
    const res = await GET();
    const body = await res.json();
    expect(body.saved).toBeNull();
  });

  it('saved is populated after PUT /api/config/model', async () => {
    const { PUT } = await import('@/app/api/config/model/route');
    await PUT(putReq({
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-savedkey1234',
      model: 'gpt-4o',
    }));
    const { GET } = await import('@/app/api/config/discover/route');
    const res = await GET();
    const body = await res.json();
    expect(body.saved).not.toBeNull();
    expect(body.saved.model).toBe('gpt-4o');
    // full key not in response
    expect(JSON.stringify(body.saved)).not.toContain('sk-savedkey1234');
    expect(body.saved.apiKeyMasked).toBe('sk-s****1234');
  });
});

describe('GET /api/config/model', () => {
  it('returns null config when nothing saved', async () => {
    const { GET } = await import('@/app/api/config/model/route');
    const res = await GET();
    const body = await res.json();
    expect(body.config).toBeNull();
  });
});

describe('PUT /api/config/model', () => {
  it('saves valid config and returns it', async () => {
    const { PUT } = await import('@/app/api/config/model/route');
    const res = await PUT(putReq({
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-mykey12345',
      model: 'gpt-4o',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.model).toBe('gpt-4o');
    expect(body.config.apiKey).toBe('sk-mykey12345');
  });

  it('rejects invalid body → 400', async () => {
    const { PUT } = await import('@/app/api/config/model/route');
    const res = await PUT(putReq({ provider: '', baseUrl: 'not-a-url', apiKey: '', model: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON → 400', async () => {
    const { PUT } = await import('@/app/api/config/model/route');
    const req = new NextRequest('http://x/api/config/model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/config/reveal', () => {
  it('returns full key for valid candidateId', async () => {
    const { POST } = await import('@/app/api/config/reveal/route');
    const res = await POST(postReq({ candidateId: 'env:OPENAI_API_KEY' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKey).toBe('sk-testtesttest');
    expect(body.provider).toBe('openai-compatible');
  });

  it('returns 404 for unknown candidateId', async () => {
    const { POST } = await import('@/app/api/config/reveal/route');
    const res = await POST(postReq({ candidateId: 'env:NONEXISTENT_KEY' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 for missing candidateId', async () => {
    const { POST } = await import('@/app/api/config/reveal/route');
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('@/app/api/config/reveal/route');
    const req = new NextRequest('http://x/api/config/reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'bad',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
