import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, Case } from '@/domain/types';
import { streamLlm } from './llm-client';

const DEFAULT_TOP_K = 3;

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function findSimilarCases(
  cfg: ModelConfig,
  input: {
    problem: CaseProblem;
    candidateCases: Case[];
    topK?: number;
  }
): Promise<{ caseId: string; score: number; reason: string }[]> {
  const { problem, candidateCases, topK = DEFAULT_TOP_K } = input;

  if (candidateCases.length <= topK) {
    return candidateCases.map(c => ({ caseId: c.id, score: 1, reason: '候选数量不超过 topK' }));
  }

  const fallback = () =>
    candidateCases.slice(0, topK).map(c => ({ caseId: c.id, score: 0.5, reason: 'fallback' }));

  const candidatesText = candidateCases.map((c, i) =>
    `${i + 1}. id=${c.id} | 标题=${c.summary?.headline ?? '无'} | 根因=${c.summary?.rootCause ?? '无'} | 现象=${c.problem.actual.slice(0, 200)}`
  ).join('\n');

  const userPrompt = `## 当前问题\n- 现象：${problem.actual}\n- 期望：${problem.expected}\n\n## 候选已解决 Bug（共 ${candidateCases.length} 条）\n${candidatesText}\n\n请从候选中找出最相似的 ${topK} 条，输出 JSON 数组（不要包裹在 markdown 代码块里）：\n[{"caseId":"...","score":0.0到1.0,"reason":"一句话"}]`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: '你是 bug 相似度分析器，根据问题描述找出最相关的历史案例。',
      userPrompt,
      maxTokens: 512,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJsonArray(fullText);
    if (!jsonStr) return fallback();

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return fallback();

    const results = parsed
      .filter((r): r is { caseId: string; score: number; reason: string } =>
        typeof r === 'object' && r !== null &&
        typeof r.caseId === 'string' &&
        typeof r.score === 'number'
      )
      .slice(0, topK);

    if (results.length === 0) return fallback();
    return results;
  } catch {
    return fallback();
  }
}
