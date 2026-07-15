import type { CaseProblem, CaseMeta, Evidence } from '@/domain/types';
import type { LlmCallOptions } from './llm-client';
import type { CodeReadResult } from './code-reader';

const SYSTEM_PROMPT = `你是一名资深工程排障助手。你的任务：结合用户提供的问题描述、证据、以及项目代码片段，给出准确、可执行的诊断和修复建议。

原则：
1. 明确列出「你已确认的事实」和「你的假设」，不要混淆。
2. 每条结论尽量指向具体证据（例如「日志第 3 行的 NPE」「controller 中未调用 dictService」）。
3. 如果证据不足，明确说明还需要什么信息，而不是硬猜。
4. 修复建议要给到函数级或文件级，最好带示例代码。
5. 全程用中文回答，代码保持原样。
6. 你并不知道所有内部实现细节；如果代码片段被截断或未提供，明确说明。

输出结构（Markdown）：
## 一句话结论
## 已确认的事实
## 推断的根因（按可能性排序）
## 建议的验证步骤
## 建议的修复方案
## 还需要什么信息（如有）`;

const MAX_PROMPT_CHARS = 50_000;
const MAX_EVIDENCE_CONTENT_CHARS = 4_000;

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [已截断 ${s.length - max} 字符]`;
}

function buildEvidenceSection(evidences: Evidence[], budget: number): { text: string; omitted: number } {
  if (evidences.length === 0) return { text: '（无证据）', omitted: 0 };

  const parts: string[] = [];
  let remaining = budget;
  let omitted = 0;

  for (let i = 0; i < evidences.length; i++) {
    const e = evidences[i];
    const content = truncateStr(e.raw.content, MAX_EVIDENCE_CONTENT_CHARS);
    const block = `### 证据 ${i + 1}: ${e.type}\n${e.summary.oneLine}\n\`\`\`\n${content}\n\`\`\``;

    if (block.length > remaining && parts.length > 0) {
      omitted = evidences.length - i;
      break;
    }
    parts.push(block);
    remaining -= block.length;
  }

  let text = parts.join('\n\n');
  if (omitted > 0) {
    text += `\n\n（已省略：${omitted} 条证据）`;
  }
  return { text, omitted };
}

function buildCodeSection(code: CodeReadResult): string {
  if (code.snippets.length === 0) return '（未提供代码上下文）';

  const header = `分支：${code.branch ?? '(未知)'}, HEAD：${code.commit ?? '(未知)'}\n命中文件（共 ${code.snippets.length}）：`;
  const files = code.snippets.map(s =>
    `### ${s.path} [命中 ${s.matched.join(', ')}]\n\`\`\`\n${s.content}\n\`\`\``
  );
  return `${header}\n\n${files.join('\n\n')}`;
}

export function buildAnalyzePrompt(input: {
  problem: CaseProblem;
  meta?: CaseMeta;
  evidences: Evidence[];
  code?: CodeReadResult;
}): LlmCallOptions {
  const { problem, meta, evidences, code } = input;

  const problemSection = `## 问题
- 实际现象：${problem.actual}
- 期望行为：${problem.expected}
- 入口：${problem.entry}
- 环境：${problem.environment}
- 模块：${meta?.module ?? '(未指定)'}
- 仓库：${meta?.repoPath ?? '(未指定)'}`;

  const codeSection = code ? buildCodeSection(code) : '（未提供代码上下文）';
  const codePart = `## 代码上下文\n${codeSection}`;
  const taskPart = `## 你的任务\n基于以上信息，按系统 prompt 定义的 6 段输出诊断报告。`;

  // Calculate budget for evidence section
  const fixedChars = SYSTEM_PROMPT.length + problemSection.length + codePart.length + taskPart.length + 100;
  const evidenceBudget = Math.max(2000, MAX_PROMPT_CHARS - fixedChars);

  const { text: evidenceText } = buildEvidenceSection(evidences, evidenceBudget);
  const evidenceSection = `## 证据\n${evidenceText}`;

  const userPrompt = [problemSection, evidenceSection, codePart, taskPart].join('\n\n');

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt
  };
}
