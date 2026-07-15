import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ModelCandidate } from '@/domain/model-config';

const KNOWN_KEY_VARS: Array<{
  envName: string;
  provider: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
}> = [
  { envName: 'ANTHROPIC_AUTH_TOKEN', provider: 'anthropic-compatible', baseUrlEnv: 'ANTHROPIC_BASE_URL', defaultBaseUrl: 'https://api.anthropic.com' },
  { envName: 'ANTHROPIC_API_KEY', provider: 'anthropic-compatible', baseUrlEnv: 'ANTHROPIC_BASE_URL', defaultBaseUrl: 'https://api.anthropic.com' },
  { envName: 'OPENAI_API_KEY', provider: 'openai-compatible', baseUrlEnv: 'OPENAI_BASE_URL', defaultBaseUrl: 'https://api.openai.com/v1' },
  { envName: 'DEEPSEEK_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { envName: 'DASHSCOPE_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { envName: 'MOONSHOT_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  { envName: 'SILICONFLOW_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://api.siliconflow.cn/v1' },
  { envName: 'ZHIPU_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { envName: 'GEMINI_API_KEY', provider: 'openai-compatible', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
];

function mask(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export interface DiscoverResult {
  candidates: ModelCandidate[];
  fullKeys: Map<string, string>;
}

export async function discoverCandidates(): Promise<DiscoverResult> {
  const candidates: ModelCandidate[] = [];
  const fullKeys = new Map<string, string>();

  // 1. Claude Code global settings
  const claudeSettings = await readJsonSafe<{ env?: Record<string, string> }>(
    path.join(os.homedir(), '.claude', 'settings.json')
  );
  if (claudeSettings?.env?.ANTHROPIC_AUTH_TOKEN) {
    const key = claudeSettings.env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = claudeSettings.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
    const id = 'claude-settings:default';
    candidates.push({
      id,
      source: 'claude-settings',
      sourceLabel: 'Claude Code 全局设置 (~/.claude/settings.json)',
      provider: 'anthropic-compatible',
      baseUrl,
      model: null,
      apiKeyMasked: mask(key),
    });
    fullKeys.set(id, key);
  }

  // 2. Environment variables
  for (const spec of KNOWN_KEY_VARS) {
    const key = process.env[spec.envName];
    if (!key) continue;
    const baseUrl = (spec.baseUrlEnv && process.env[spec.baseUrlEnv]) || spec.defaultBaseUrl || '';
    const id = `env:${spec.envName}`;
    if (candidates.some(c => c.id === id)) continue;
    candidates.push({
      id,
      source: 'env',
      sourceLabel: `环境变量 ${spec.envName}`,
      provider: spec.provider,
      baseUrl,
      model: null,
      apiKeyMasked: mask(key),
    });
    fullKeys.set(id, key);
  }

  // 3. .env.local in project root
  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envLocalRaw = await fs.readFile(envLocalPath, 'utf8').catch(() => null);
  if (envLocalRaw) {
    const map = new Map<string, string>();
    for (const line of envLocalRaw.split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
      if (m) map.set(m[1], m[2].replace(/^["']|["']$/g, ''));
    }
    for (const spec of KNOWN_KEY_VARS) {
      const key = map.get(spec.envName);
      if (!key) continue;
      const baseUrl = (spec.baseUrlEnv && map.get(spec.baseUrlEnv)) || spec.defaultBaseUrl || '';
      const id = `dotenv:${spec.envName}`;
      candidates.push({
        id,
        source: 'dotenv',
        sourceLabel: `项目 .env.local 中的 ${spec.envName}`,
        provider: spec.provider,
        baseUrl,
        model: null,
        apiKeyMasked: mask(key),
      });
      fullKeys.set(id, key);
    }
  }

  return { candidates, fullKeys };
}
