import { v4 as uuid } from 'uuid';
import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, FeatureKnowledge, Playbook } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `你是一名资深后端排障专家。
基于问题描述、该功能的已知模式、相似历史，起草一份 3-6 步的排障 playbook。
每步是一个动词短句（如"抓接口 cURL"），可选补充 hint（一句提示）。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "steps": [
    { "title": "步骤名", "hint": "可选提示" }
  ]
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

export async function generatePlaybook(
  cfg: ModelConfig,
  input: {
    problem: CaseProblem;
    featureKnowledge?: FeatureKnowledge;
    relatedCases?: { headline?: string; rootCause?: string; fix?: string }[];
  }
): Promise<Playbook | null> {
  const { problem, featureKnowledge, relatedCases } = input;

  const parts: string[] = [
    `## 问题描述\n- 实际现象：${problem.actual}\n- 期望行为：${problem.expected}\n- 入口：${problem.entry}\n- 环境：${problem.environment}`
  ];

  if (featureKnowledge && featureKnowledge.commonRootCauses.length > 0) {
    parts.push(`## 已知根因模式\n${featureKnowledge.commonRootCauses.map(c => `- ${c}`).join('\n')}`);
  }

  if (relatedCases && relatedCases.length > 0) {
    const lines = relatedCases
      .filter(r => r.headline || r.rootCause)
      .map((r, i) => `${i + 1}. ${r.headline ?? ''} → 根因：${r.rootCause ?? '?'}`);
    if (lines.length > 0) {
      parts.push(`## 相似历史案例\n${lines.join('\n')}`);
    }
  }

  const userPrompt = parts.join('\n\n');

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 512,
      temperature: 0.2
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;

    const now = new Date().toISOString();
    const steps = (parsed.steps as { title?: unknown; hint?: unknown }[])
      .filter(s => typeof s.title === 'string' && s.title.trim())
      .slice(0, 6)
      .map((s, i) => ({
        id: uuid(),
        order: i + 1,
        title: (s.title as string).trim(),
        hint: typeof s.hint === 'string' ? s.hint.trim() : undefined,
        status: 'todo' as const,
        updatedAt: now,
        updatedBy: 'llm' as const
      }));

    if (steps.length === 0) return null;

    return { steps, source: 'auto', updatedAt: now };
  } catch {
    return null;
  }
}
