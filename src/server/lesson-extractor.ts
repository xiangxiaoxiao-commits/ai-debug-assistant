import type { ModelConfig } from '@/domain/model-config';
import type { Case, Message, Lesson } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `从这个已 resolved 的 bug 的对话中，抽取一份简短「教训」。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "symptomPattern": "一行症状描述，≤40字",
  "rootCause": "根因，≤40字",
  "fix": "修复方案摘要，≤40字"
}`;

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function extractLesson(
  cfg: ModelConfig,
  input: { kase: Case; messages: Message[] }
): Promise<Lesson | null> {
  const { kase, messages } = input;

  const convoText = messages
    .filter(m => m.role !== 'system-summary')
    .slice(-10)
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 400)}`)
    .join('\n\n');

  const userPrompt = `## Bug 描述\n${kase.problem.actual}\n\n## 最终结论\n${kase.summary?.rootCause ?? '无'}\n修复：${kase.summary?.fixApproach ?? '无'}\n\n## 关键对话\n${convoText || '（无对话记录）'}`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 256,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed.symptomPattern !== 'string' || !parsed.symptomPattern ||
      typeof parsed.rootCause !== 'string' || !parsed.rootCause ||
      typeof parsed.fix !== 'string' || !parsed.fix
    ) return null;

    return {
      symptomPattern: parsed.symptomPattern,
      rootCause: parsed.rootCause,
      fix: parsed.fix,
      extractedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
