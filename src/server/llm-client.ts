import type { ModelConfig } from '@/domain/model-config';

export interface LlmImage {
  mediaType: string;    // 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  base64: string;       // raw base64, no `data:` prefix
}

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  images?: LlmImage[];  // if present, sent as multimodal content blocks
  maxTokens?: number;
  temperature?: number;
}

export type LlmChunk =
  | { type: 'text'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done'; inputTokens?: number; outputTokens?: number };

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;
const TIMEOUT_MS = 60_000;

/** Heuristic: does the configured model name suggest vision support? */
export function modelSupportsVision(cfg: ModelConfig): boolean {
  const m = cfg.model.toLowerCase();
  // Anthropic: opus / sonnet / haiku from 3+; almost all recent Claudes are vision-capable
  if (m.includes('opus') || m.includes('sonnet') || m.includes('haiku')) return true;
  if (m.startsWith('claude-3') || m.startsWith('claude-4')) return true;
  // OpenAI-compatible: gpt-4o / gpt-4-turbo (vision) / gpt-4v / o1 / o3 with vision
  if (m.includes('gpt-4o') || m.includes('gpt-4v') || m.includes('gpt-4-turbo')) return true;
  if (m.includes('vision') || m.includes('vl')) return true;   // qwen-vl, glm-4v etc.
  return false;
}

/** Redact apiKey from error strings before surfacing them */
function redactKey(msg: string, apiKey: string): string {
  if (!apiKey) return msg;
  return msg.replaceAll(apiKey, '[REDACTED]');
}

async function* streamOpenAiCompatible(
  cfg: ModelConfig,
  opts: LlmCallOptions,
  signal: AbortSignal
): AsyncGenerator<LlmChunk> {
  const hasImages = (opts.images?.length ?? 0) > 0 && modelSupportsVision(cfg);
  const userContent = hasImages
    ? [
        { type: 'text', text: opts.userPrompt },
        ...opts.images!.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
        }))
      ]
    : opts.userPrompt;

  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: userContent }
    ],
    stream: true,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE
  });

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`
      },
      body,
      signal
    });
  } catch (e) {
    yield { type: 'error', message: redactKey((e as Error).message, cfg.apiKey) };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    yield { type: 'error', message: redactKey(`HTTP ${res.status}: ${text}`, cfg.apiKey) };
    return;
  }

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  yield* readSseStream(res, signal, cfg.apiKey, (data) => {
    if (data === '[DONE]') return { done: true };
    try {
      const obj = JSON.parse(data);
      const delta: string = obj?.choices?.[0]?.delta?.content ?? '';
      if (obj?.usage) {
        inputTokens = obj.usage.prompt_tokens;
        outputTokens = obj.usage.completion_tokens;
      }
      if (delta) return { text: delta };
    } catch { /* skip malformed */ }
    return null;
  });

  yield { type: 'done', inputTokens, outputTokens };
}

async function* streamAnthropicCompatible(
  cfg: ModelConfig,
  opts: LlmCallOptions,
  signal: AbortSignal
): AsyncGenerator<LlmChunk> {
  const hasImages = (opts.images?.length ?? 0) > 0 && modelSupportsVision(cfg);
  const userContent = hasImages
    ? [
        ...opts.images!.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
        })),
        { type: 'text', text: opts.userPrompt }
      ]
    : opts.userPrompt;

  const body = JSON.stringify({
    model: cfg.model,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    stream: true
  });

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body,
      signal
    });
  } catch (e) {
    yield { type: 'error', message: redactKey((e as Error).message, cfg.apiKey) };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    yield { type: 'error', message: redactKey(`HTTP ${res.status}: ${text}`, cfg.apiKey) };
    return;
  }

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  yield* readSseStream(res, signal, cfg.apiKey, (data) => {
    try {
      const obj = JSON.parse(data);
      const evType: string = obj?.type ?? '';
      if (evType === 'content_block_delta') {
        const text: string = obj?.delta?.text ?? '';
        if (text) return { text };
      } else if (evType === 'message_delta' && obj?.usage) {
        outputTokens = obj.usage.output_tokens;
      } else if (evType === 'message_start' && obj?.message?.usage) {
        inputTokens = obj.message.usage.input_tokens;
      } else if (evType === 'message_stop') {
        return { done: true };
      }
    } catch { /* skip malformed */ }
    return null;
  });

  yield { type: 'done', inputTokens, outputTokens };
}

/** Shared SSE line reader. Calls `parse` for each `data:` line.
 *  parse returns:
 *    { text: string } → yield text chunk
 *    { done: true }  → stop iteration
 *    null            → skip
 */
async function* readSseStream(
  res: Response,
  signal: AbortSignal,
  apiKey: string,
  parse: (data: string) => { text: string } | { done: boolean } | null
): AsyncGenerator<LlmChunk> {
  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (signal.aborted) {
        yield { type: 'error', message: 'Request aborted' };
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        const result = parse(data);
        if (!result) continue;
        if ('done' in result && result.done) return;
        if ('text' in result && result.text) yield { type: 'text', text: result.text };
      }
    }
  } catch (e) {
    yield { type: 'error', message: redactKey((e as Error).message, apiKey) };
  } finally {
    reader.releaseLock();
  }
}

/** Detect provider shape from provider string */
function isAnthropic(provider: string): boolean {
  return provider.toLowerCase().includes('anthropic');
}

export async function* streamLlm(cfg: ModelConfig, opts: LlmCallOptions): AsyncGenerator<LlmChunk> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const gen = isAnthropic(cfg.provider)
      ? streamAnthropicCompatible(cfg, opts, controller.signal)
      : streamOpenAiCompatible(cfg, opts, controller.signal);
    yield* gen;
  } finally {
    clearTimeout(timer);
  }
}
