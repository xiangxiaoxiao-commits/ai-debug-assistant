import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-discover-'));
  process.env.AI_DEBUG_HOME = tmp;
  // Clear all known provider keys so prior env doesn't bleed in
  for (const k of [
    'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY', 'OPENAI_BASE_URL',
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
});

describe('config-discover — env source', () => {
  it('picks up OPENAI_API_KEY and masks it', async () => {
    process.env.OPENAI_API_KEY = 'sk-testtesttest1234';
    const { discoverCandidates } = await import('@/server/config-discover');
    const { candidates, fullKeys } = await discoverCandidates();
    const c = candidates.find(x => x.id === 'env:OPENAI_API_KEY');
    expect(c).toBeDefined();
    expect(c!.source).toBe('env');
    expect(c!.provider).toBe('openai-compatible');
    expect(c!.baseUrl).toBe('https://api.openai.com/v1');
    expect(c!.apiKeyMasked).toBe('sk-t****1234');
    // full key is NOT in candidates
    expect(JSON.stringify(candidates)).not.toContain('sk-testtesttest1234');
    // full key IS in the internal map
    expect(fullKeys.get('env:OPENAI_API_KEY')).toBe('sk-testtesttest1234');
  });

  it('short key (≤8 chars) → mask shows ***', async () => {
    process.env.OPENAI_API_KEY = 'short';
    const { discoverCandidates } = await import('@/server/config-discover');
    const { candidates } = await discoverCandidates();
    const c = candidates.find(x => x.id === 'env:OPENAI_API_KEY');
    expect(c!.apiKeyMasked).toBe('***');
  });

  it('respects custom OPENAI_BASE_URL', async () => {
    process.env.OPENAI_API_KEY = 'sk-abcdefghijklmno';
    process.env.OPENAI_BASE_URL = 'https://my-proxy.example.com/v1';
    const { discoverCandidates } = await import('@/server/config-discover');
    const { candidates } = await discoverCandidates();
    const c = candidates.find(x => x.id === 'env:OPENAI_API_KEY');
    expect(c!.baseUrl).toBe('https://my-proxy.example.com/v1');
  });

  it('no env vars → empty candidates', async () => {
    const { discoverCandidates } = await import('@/server/config-discover');
    const { candidates } = await discoverCandidates();
    const envCandidates = candidates.filter(x => x.source === 'env');
    expect(envCandidates).toHaveLength(0);
  });

  it('model is null for env candidates', async () => {
    process.env.DEEPSEEK_API_KEY = 'ds-123456789012';
    const { discoverCandidates } = await import('@/server/config-discover');
    const { candidates } = await discoverCandidates();
    const c = candidates.find(x => x.id === 'env:DEEPSEEK_API_KEY');
    expect(c!.model).toBeNull();
  });
});

describe('config-discover — dotenv source', () => {
  it('reads ANTHROPIC_AUTH_TOKEN from .env.local via dotenv source', async () => {
    // Write a fake .env.local into the cwd (which vitest sets to project root)
    const envLocalPath = path.join(process.cwd(), '.env.local');
    const existed = await fs.access(envLocalPath).then(() => true).catch(() => false);

    // Only run this test if .env.local doesn't already exist (to avoid clobbering)
    if (existed) return;

    await fs.writeFile(envLocalPath, 'ANTHROPIC_AUTH_TOKEN=sk-local12345678\n', 'utf8');
    try {
      const { discoverCandidates } = await import('@/server/config-discover');
      const { candidates, fullKeys } = await discoverCandidates();
      const c = candidates.find(x => x.id === 'dotenv:ANTHROPIC_AUTH_TOKEN');
      expect(c).toBeDefined();
      expect(c!.source).toBe('dotenv');
      expect(c!.apiKeyMasked).toBe('sk-l****5678');
      expect(fullKeys.get('dotenv:ANTHROPIC_AUTH_TOKEN')).toBe('sk-local12345678');
      expect(JSON.stringify(candidates)).not.toContain('sk-local12345678');
    } finally {
      await fs.rm(envLocalPath, { force: true });
    }
  });
});
