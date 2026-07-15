import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, BugSummary } from '@/domain/types';
import { streamLlm } from './llm-client';

const EXTRACTION_SYSTEM_PROMPT = `你是一名 bug tracker 摘要器。用户会给你一个 bug 的问题描述和最新一轮 AI 诊断回复，你要输出一个 JSON 对象，反映当前对这个 bug 的整体结论。

输出严格遵循以下 JSON schema（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "status": "open" | "investigating" | "resolved" | "wont-fix",
  "headline": "一句话结论，20字以内",
  "rootCause": "根因概要，一到两句",
  "fixApproach": "修复方案概要，一到两句",
  "verified": true | false,
  "verificationNotes": "已验证的话说明验证方式，未验证则留空"
}

status 判定规则：
- open: 只有问题描述、还没有明确诊断
- investigating: 有初步诊断，但需要更多信息
- resolved: 已经给出可执行的修复方案且用户确认或有强证据支持
- wont-fix: 用户明确表示不修`;

/** Extract the first balanced JSON object from a string */
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

function fallback(current: BugSummary | undefined): BugSummary {
  return current ?? {
    status: 'investigating',
    updatedAt: new Date().toISOString(),
    updatedBy: 'llm'
  };
}

export async function extractSummary(
  cfg: ModelConfig,
  opts: {
    problem: CaseProblem;
    latestAssistantReply: string;
    currentSummary?: BugSummary;
  }
): Promise<BugSummary> {
  const { problem, latestAssistantReply, currentSummary } = opts;

  const userPrompt = `## 问题描述\n${problem.actual}\n\n## 最新诊断回复\n${latestAssistantReply.slice(0, 6000)}`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 512,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return fallback(currentSummary);

    const parsed = JSON.parse(jsonStr);

    const validStatuses = ['open', 'investigating', 'resolved', 'wont-fix'];
    const status = validStatuses.includes(parsed.status) ? parsed.status : 'investigating';

    const summary: BugSummary = {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    };
    if (typeof parsed.headline === 'string' && parsed.headline) summary.headline = parsed.headline;
    if (typeof parsed.rootCause === 'string' && parsed.rootCause) summary.rootCause = parsed.rootCause;
    if (typeof parsed.fixApproach === 'string' && parsed.fixApproach) summary.fixApproach = parsed.fixApproach;
    if (typeof parsed.verified === 'boolean') summary.verified = parsed.verified;
    if (typeof parsed.verificationNotes === 'string' && parsed.verificationNotes) {
      summary.verificationNotes = parsed.verificationNotes;
    }

    return summary;
  } catch {
    return fallback(currentSummary);
  }
}
