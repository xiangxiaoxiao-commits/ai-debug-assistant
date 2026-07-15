import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-cfgstore-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('config-store', () => {
  const validConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-testkey',
    model: 'gpt-4o',
  };

  it('readSavedConfig returns null when file missing', async () => {
    const { readSavedConfig } = await import('@/server/config-store');
    const result = await readSavedConfig();
    expect(result).toBeNull();
  });

  it('writeSavedConfig + readSavedConfig roundtrip', async () => {
    const { writeSavedConfig, readSavedConfig } = await import('@/server/config-store');
    await writeSavedConfig(validConfig);
    const back = await readSavedConfig();
    expect(back).toEqual(validConfig);
  });

  it('config.json is written under AI_DEBUG_HOME', async () => {
    const { writeSavedConfig } = await import('@/server/config-store');
    await writeSavedConfig(validConfig);
    const filePath = path.join(tmp, 'config.json');
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    expect(raw.apiKey).toBe('sk-testkey');
    expect(raw.model).toBe('gpt-4o');
  });

  it('readSavedConfig returns null for invalid JSON structure', async () => {
    const filePath = path.join(tmp, 'config.json');
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(filePath, '{"provider":"","baseUrl":"not-a-url","apiKey":"","model":""}', 'utf8');
    const { readSavedConfig } = await import('@/server/config-store');
    const result = await readSavedConfig();
    expect(result).toBeNull();
  });

  it('overwrites existing config on second write', async () => {
    const { writeSavedConfig, readSavedConfig } = await import('@/server/config-store');
    await writeSavedConfig(validConfig);
    const updated = { ...validConfig, model: 'gpt-4-turbo' };
    await writeSavedConfig(updated);
    const back = await readSavedConfig();
    expect(back!.model).toBe('gpt-4-turbo');
  });
});
