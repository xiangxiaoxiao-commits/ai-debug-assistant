import type { CaseProblem, CaseMeta, Evidence, Message, BugSummary, FeatureKnowledge } from '@/domain/types';
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

const CONVERSATION_SYSTEM_PROMPT = `你是一名资深工程排障助手。这是一次多轮排障对话。用户可能在后续消息里补充证据、修正描述、追问细节，你要基于**累计的证据**和**当前诊断结论**回答。如果新信息推翻了前一轮的结论，明确说出「修正：…」。

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

const MAX_CONVERSATION_PROMPT_CHARS = 30_000;
const COMPACTION_FIRST_SENTENCE_MAX = 120;

function renderBugSummary(s: BugSummary): string {
  const lines: string[] = [`- 状态：${s.status}`];
  if (s.headline) lines.push(`- 结论：${s.headline}`);
  if (s.rootCause) lines.push(`- 根因：${s.rootCause}`);
  if (s.fixApproach) lines.push(`- 修复方案：${s.fixApproach}`);
  if (s.verified !== undefined) lines.push(`- 已验证：${s.verified ? '是' : '否'}`);
  if (s.verificationNotes) lines.push(`- 验证说明：${s.verificationNotes}`);
  return lines.join('\n');
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  // Break at first sentence ending or newline
  const match = trimmed.match(/^(.{1,120}[。.!！\n])/);
  if (match) return match[1].trim();
  return trimmed.slice(0, COMPACTION_FIRST_SENTENCE_MAX) + (trimmed.length > COMPACTION_FIRST_SENTENCE_MAX ? '…' : '');
}

function buildHistorySection(messages: Message[], charBudget: number): string {
  if (messages.length === 0) return '';

  // Separate system-summary messages (place before history)
  const summaryMsgs = messages.filter(m => m.role === 'system-summary');
  const roundMsgs = messages.filter(m => m.role !== 'system-summary');

  const summaryPart = summaryMsgs.map(m => `### 背景摘要\n${m.content}`).join('\n\n');

  // Build round-by-round, newest messages take priority
  const roundParts: string[] = [];
  let used = summaryPart.length;
  let compacted = 0;

  for (let i = roundMsgs.length - 1; i >= 0; i--) {
    const m = roundMsgs[i];
    const roleLabel = m.role === 'user' ? '**用户**' : '**助手**';
    const entry = `${roleLabel}：${m.content}`;
    if (used + entry.length > charBudget && i < roundMsgs.length - 1) {
      // Compact this and all earlier messages
      compacted = i + 1;
      break;
    }
    roundParts.unshift(entry);
    used += entry.length;
  }

  const parts: string[] = [];
  if (summaryPart) parts.push(summaryPart);

  if (compacted > 0) {
    const condensed = roundMsgs.slice(0, compacted)
      .map(m => {
        const roleLabel = m.role === 'user' ? '用户' : '助手';
        return `${roleLabel}：${firstSentence(m.content)}`;
      })
      .join('\n');
    parts.push(`## 早期对话摘要\n${condensed}`);
  }

  if (roundParts.length > 0) {
    parts.push(roundParts.join('\n\n'));
  }

  return parts.join('\n\n');
}

function buildFeatureInjection(
  featureKnowledge?: FeatureKnowledge,
  relatedCases?: { headline?: string; rootCause?: string; fix?: string }[]
): string {
  const MAX_INJECTION = 4000;
  const parts: string[] = [];

  if (featureKnowledge && (featureKnowledge.commonRootCauses.length > 0 || featureKnowledge.verifiedFixes.length > 0)) {
    const causesText = featureKnowledge.commonRootCauses.map(c => `- ${c}`).join('\n');
    const fixesText = featureKnowledge.verifiedFixes
      .map(v => `- 症状：${v.symptomPattern} → 根因：${v.rootCause} → 修复：${v.fix}`)
      .join('\n');
    parts.push(`## 该功能的已知模式\n常见根因：\n${causesText}\n\n已验证的修复模式：\n${fixesText}\n\n（这些来自本模块的历史 bug。如果新 bug 匹配某个模式，直接引用；否则说明为什么不适用。）`);
  }

  if (relatedCases && relatedCases.length > 0) {
    const lines = relatedCases
      .filter(r => r.headline)
      .map(r => `- ${r.headline}：${r.rootCause ?? '未知根因'} → ${r.fix ?? '未知修复'}`)
      .join('\n');
    if (lines) parts.push(`## 相似历史 bug（供参考）\n${lines}`);
  }

  const combined = parts.join('\n\n');
  if (combined.length > MAX_INJECTION) {
    return combined.slice(0, MAX_INJECTION) + '\n\n（已截断）';
  }
  return combined;
}

export function buildConversationPrompt(input: {
  problem: CaseProblem;
  meta?: CaseMeta;
  evidences: Evidence[];
  code?: CodeReadResult;
  messages: Message[];
  currentSummary?: BugSummary;
  featureKnowledge?: FeatureKnowledge;
  relatedCases?: { headline?: string; rootCause?: string; fix?: string }[];
}): LlmCallOptions {
  const { problem, meta, evidences, code, messages, currentSummary, featureKnowledge, relatedCases } = input;

  const summarySection = currentSummary
    ? `## 当前 Bug 摘要\n${renderBugSummary(currentSummary)}`
    : `## 当前 Bug 摘要\n（首次分析，尚无摘要）`;

  const problemSection = `## 问题描述
- 实际现象：${problem.actual}
- 期望行为：${problem.expected}
- 入口：${problem.entry}
- 环境：${problem.environment}
- 模块：${meta?.module ?? '(未指定)'}
- 仓库：${meta?.repoPath ?? '(未指定)'}`;

  const codeSection = code ? buildCodeSection(code) : '（未提供代码上下文）';
  const codePart = `## 代码上下文\n${codeSection}`;

  const taskPart = `## 当前任务\n基于以上，回答用户的最新消息。保持结构化输出（一句话结论 / 已确认事实 / 根因假设 / 建议验证 / 建议修复 / 还需要什么信息）。`;

  const featureInjection = buildFeatureInjection(featureKnowledge, relatedCases);

  // Calculate budget for evidence + history
  const fixedChars =
    CONVERSATION_SYSTEM_PROMPT.length +
    featureInjection.length +
    summarySection.length +
    problemSection.length +
    codePart.length +
    taskPart.length +
    200;
  const remaining = Math.max(4000, MAX_CONVERSATION_PROMPT_CHARS - fixedChars);
  const evidenceBudget = Math.floor(remaining * 0.6);
  const historyBudget = remaining - evidenceBudget;

  const { text: evidenceText } = buildEvidenceSection(evidences, evidenceBudget);
  const evidenceSection = `## 已收集证据（${evidences.length} 条）\n${evidenceText}`;

  const historyText = buildHistorySection(messages, historyBudget);
  const historySection = historyText ? `## 对话历史\n${historyText}` : '';

  const parts = featureInjection
    ? [featureInjection, summarySection, problemSection, evidenceSection, codePart]
    : [summarySection, problemSection, evidenceSection, codePart];
  if (historySection) parts.push(historySection);
  parts.push(taskPart);

  const userPrompt = parts.join('\n\n');

  return {
    systemPrompt: CONVERSATION_SYSTEM_PROMPT,
    userPrompt
  };
}
