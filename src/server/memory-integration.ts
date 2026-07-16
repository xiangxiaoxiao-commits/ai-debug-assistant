// Bridge between the debug-assistant's own case/message flow and the
// standalone memory service. All calls are server-side (direct store calls,
// no HTTP round-trip), and every LLM-driven path is fire-and-forget so the
// primary user flow never blocks on memory work.

import type { ModelConfig } from '@/domain/model-config';
import type { Case, CaseProblem, Message } from '@/domain/types';
import type { Project, MemoryEntry } from '@/domain/memory';
import { streamLlm } from './llm-client';
import {
  ensureDefaultProject,
  findProjectByRepoPath,
  createProject,
  getProject,
  updateProject,
  tryGetProject
} from '@/memory/project-store';
import { remember, recall, topByStrength } from '@/memory/memory-store';
import { normalizeRepoPath, repoBasename } from '@/memory/repo-path';

/** Get or create a Project for a Case being submitted.  Idempotent.
 *  Order of preference: normalized repoPath > module name > default project. */
export async function resolveProjectForCase(input: {
  repoPath?: string;
  module?: string;
}): Promise<Project> {
  const normalized = normalizeRepoPath(input.repoPath);
  if (normalized) {
    const existing = await findProjectByRepoPath(normalized);
    if (existing) return existing;
    return createProject({ name: repoBasename(normalized), repoPath: normalized });
  }
  if (input.module && input.module.trim()) {
    // Reuse module name if it happens to be a project name; otherwise create.
    // We do not scan by aliases here — path is the canonical id.
    return createProject({ name: input.module.trim() });
  }
  return ensureDefaultProject();
}

/** Compose a short prompt snippet with project identity + recalled memories.
 *  Returns empty string if project is unknown or nothing relevant. Safe to
 *  concatenate into the user prompt. */
export async function buildProjectMemoryContext(
  projectId: string | undefined,
  query: string,
  budgetChars = 2500
): Promise<{ text: string; identityUsed: boolean; hitCount: number }> {
  if (!projectId) return { text: '', identityUsed: false, hitCount: 0 };
  const project = await tryGetProject(projectId);
  if (!project) return { text: '', identityUsed: false, hitCount: 0 };

  const parts: string[] = [];

  // Identity (core memory)
  if (project.identity) {
    const idLines: string[] = [];
    if (project.identity.techStack?.length) idLines.push(`- 技术栈：${project.identity.techStack.join('、')}`);
    if (project.identity.languages?.length) idLines.push(`- 语言：${project.identity.languages.join('、')}`);
    if (project.identity.layout) idLines.push(`- 目录布局：${project.identity.layout}`);
    if (project.identity.conventions?.length) {
      idLines.push(`- 已知约定：\n  - ${project.identity.conventions.join('\n  - ')}`);
    }
    if (idLines.length > 0) {
      parts.push(`## 项目档案（${project.name}）\n${idLines.join('\n')}`);
    }
  }

  // Recalled memories (semantic + procedural)
  const hits = await recall(projectId, {
    query,
    kinds: ['semantic', 'procedural'],
    topK: 8
  });
  if (hits.length > 0) {
    const lines = hits.slice(0, 8).map(h => {
      const kindTag = h.entry.kind === 'procedural' ? '[流程]' : '[事实]';
      return `- ${kindTag} ${h.entry.content}（× ${h.entry.strength}）`;
    });
    parts.push(`## 项目历史知识（top ${hits.length}）\n${lines.join('\n')}`);
  }

  let combined = parts.join('\n\n');
  if (combined.length > budgetChars) combined = combined.slice(0, budgetChars) + '\n（已截断）';

  return { text: combined, identityUsed: !!project.identity, hitCount: hits.length };
}

/** Extract a JSON blob from a possibly-noisy LLM output using bracket balance. */
function extractJson(text: string, open = '{', close = '}'): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** LLM-judged: does this resolved case contain a project-level lesson worth
 *  saving? If yes, remember() it under semantic; also promote root causes as
 *  reinforced entries. Never throws. */
export async function promoteLessonToMemory(cfg: ModelConfig, input: {
  projectId: string;
  problem: CaseProblem;
  rootCause?: string;
  fix?: string;
  caseId: string;
}): Promise<{ added: number; reinforced: number }> {
  const stat = { added: 0, reinforced: 0 };
  if (!input.rootCause && !input.fix) return stat;

  const systemPrompt = `你判断这次已解决的 bug 教训是否值得作为项目层的知识记住。

规则：
- 只保存**项目层通用**的规则/根因/约定，不保存本次特定的细节
- 每条 ≤ 60 字，直白陈述句

输出严格 JSON，不要额外文字：
{ "entries": [{ "kind": "semantic" | "procedural", "content": "..." }] }

若无值得记的，返回 { "entries": [] }`;

  const userPrompt = `## 问题\n- 实际现象：${input.problem.actual}\n- 期望：${input.problem.expected}\n\n## 根因\n${input.rootCause ?? '(未定)'}\n\n## 修复方案\n${input.fix ?? '(未定)'}`;

  try {
    let full = '';
    for await (const chunk of streamLlm(cfg, { systemPrompt, userPrompt, maxTokens: 512, temperature: 0 })) {
      if (chunk.type === 'text') full += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }
    const jsonStr = extractJson(full);
    if (!jsonStr) return stat;
    const parsed = JSON.parse(jsonStr) as { entries?: { kind?: string; content?: string }[] };
    if (!Array.isArray(parsed.entries)) return stat;

    for (const raw of parsed.entries) {
      if (typeof raw.content !== 'string' || !raw.content.trim()) continue;
      const kind = raw.kind === 'procedural' ? 'procedural' : 'semantic';
      const result = await remember(input.projectId, {
        kind,
        content: raw.content.trim(),
        tags: [kind === 'procedural' ? 'playbook' : 'root-cause'],
        sources: [`case:${input.caseId}`],
        reinforceIfSimilar: true,
        updatedBy: 'llm'
      });
      if (result.reinforced) stat.reinforced++;
      else stat.added++;
    }
  } catch {
    /* swallow — non-fatal */
  }
  return stat;
}

/** LLM-judged: refresh Project.identity from a code snippet + problem.
 *  Only overwrites fields that are missing or clearly contradicted by evidence.
 *  Never throws. */
export async function refreshProjectIdentity(cfg: ModelConfig, input: {
  projectId: string;
  problem: CaseProblem;
  codeSnippetsSummary?: string;
}): Promise<boolean> {
  const project = await tryGetProject(input.projectId);
  if (!project) return false;

  // Skip if identity was updated within the last 7 days AND has content
  if (project.identity) {
    const age = Date.now() - new Date(project.identity.updatedAt).getTime();
    const hasContent =
      (project.identity.techStack?.length ?? 0) +
      (project.identity.languages?.length ?? 0) +
      (project.identity.conventions?.length ?? 0) > 0;
    if (hasContent && age < 7 * 24 * 60 * 60 * 1000) return false;
  }

  const systemPrompt = `你根据 bug 描述和代码片段，推断这个项目的技术画像。宁缺勿滥，只填有明确证据的字段。

输出严格 JSON：
{ "techStack": ["..."], "languages": ["..."], "layout": "一句话描述目录", "conventions": ["..."] }`;

  const userPrompt = `## Bug 上下文\n实际：${input.problem.actual}\n期望：${input.problem.expected}\n\n## 代码片段\n${input.codeSnippetsSummary ?? '(无代码片段)'}\n\n## 已有画像\n${JSON.stringify(project.identity ?? {})}`;

  try {
    let full = '';
    for await (const chunk of streamLlm(cfg, { systemPrompt, userPrompt, maxTokens: 512, temperature: 0 })) {
      if (chunk.type === 'text') full += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }
    const jsonStr = extractJson(full);
    if (!jsonStr) return false;
    const parsed = JSON.parse(jsonStr) as {
      techStack?: string[];
      languages?: string[];
      layout?: string;
      conventions?: string[];
    };

    const merged = {
      techStack: parsed.techStack?.length ? parsed.techStack : project.identity?.techStack,
      languages: parsed.languages?.length ? parsed.languages : project.identity?.languages,
      layout: parsed.layout || project.identity?.layout,
      conventions: parsed.conventions?.length ? parsed.conventions : project.identity?.conventions,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm' as const
    };
    await updateProject(input.projectId, { identity: merged });
    return true;
  } catch {
    return false;
  }
}

/** Convenience re-exports for routes/tests that want direct access. */
export { getProject, remember, recall, topByStrength };
export type { Project, MemoryEntry };
