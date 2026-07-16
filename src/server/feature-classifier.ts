import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, CaseMeta, Feature } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `你负责把 bug 归入业务模块。看用户描述，从已有模块中挑一个最匹配的；如果都不匹配，起一个简短业务名（2-6 字，如「审批」「订单」「登录」）。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "featureName": "模块名",
  "matchedExistingId": "已有模块的 uuid 或 null",
  "confidence": 0.0到1.0的数字,
  "reasoning": "一句话说明"
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

const FALLBACK = { featureName: '未分类', confidence: 0, reasoning: 'classification failed' };

export async function classifyFeature(
  cfg: ModelConfig,
  input: {
    problem: CaseProblem;
    meta?: CaseMeta;
    existingFeatures: Feature[];
  }
): Promise<{ featureName: string; matchedExistingId?: string; confidence: number; reasoning: string }> {
  const { problem, meta, existingFeatures } = input;

  const featureList = existingFeatures.length > 0
    ? existingFeatures.map(f => `- ${f.name} (id: ${f.id})`).join('\n')
    : '（暂无已有模块）';

  const userPrompt = `## 已有业务模块\n${featureList}\n\n## Bug 描述\n- 实际现象：${problem.actual}\n- 期望行为：${problem.expected}\n- 入口：${problem.entry}\n- 环境：${problem.environment}${meta?.module ? `\n- 模块提示：${meta.module}` : ''}`;

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
    if (!jsonStr) return FALLBACK;

    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.featureName !== 'string' || !parsed.featureName) return FALLBACK;

    const matchedExistingId =
      typeof parsed.matchedExistingId === 'string' && parsed.matchedExistingId
        ? parsed.matchedExistingId
        : undefined;

    return {
      featureName: parsed.featureName,
      matchedExistingId,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : ''
    };
  } catch {
    return FALLBACK;
  }
}
