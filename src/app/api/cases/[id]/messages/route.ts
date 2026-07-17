import { NextRequest } from 'next/server';
import { z } from 'zod';
import { readSavedConfig } from '@/server/config-store';
import { getCase, appendMessage, updateMessage, updateSummary, updatePlaybook } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { readCodeContext } from '@/server/code-reader';
import { quickIngest } from '@/server/quick-ingest';
import { buildConversationPrompt } from '@/server/prompt-builder';
import { streamLlm, modelSupportsVision } from '@/server/llm-client';
import { loadImageAttachments } from '@/server/image-loader';
import { extractSummary } from '@/server/summary-extractor';
import { getFeature } from '@/server/feature-store';
import { TraceRecorder } from '@/server/trace-recorder';
import { updatePlaybookProgress } from '@/server/playbook-updater';
import { buildProjectMemoryContext } from '@/server/memory-integration';
import type { Case, Evidence, FeatureKnowledge } from '@/domain/types';

export const dynamic = 'force-dynamic';

const postBodySchema = z.object({
  text: z.string()
});

function buildKeywords(kase: Case, evidences: Evidence[]): string[] {
  const words = new Set<string>();
  const push = (s: string | undefined) => {
    if (s) {
      const matches = s.match(/\b[A-Za-z][A-Za-z0-9_/]{2,}\b/g);
      matches?.forEach(w => words.add(w));
    }
  };
  push(kase.problem.entry);
  push(kase.problem.actual);
  push(kase.meta?.module);
  for (const e of evidences) {
    for (const k of e.summary.keywords) words.add(k);
  }
  return Array.from(words).slice(0, 30);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const raw = await req.json().catch(() => null);
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const cfg = await readSavedConfig();
  if (!cfg) return new Response('model not configured', { status: 400 });

  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  const userMsg = await appendMessage(id, {
    role: 'user',
    content: parsed.data.text || kase.problem.actual
  });

  const recorder = new TraceRecorder(id, 'send-message', userMsg.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const emitStep = () => {
        const s = recorder.lastStep;
        if (s) send({ type: 'trace-step', step: { kind: s.kind, label: s.label, status: s.status, durationMs: s.durationMs } });
      };

      try {
        // quick-ingest
        let evidenceIds: string[] = [];
        if (parsed.data.text.trim()) {
          try {
            const ingestResult = await recorder.step(
              'quick-ingest',
              '快速录入用户消息',
              () => quickIngest(id, parsed.data.text)
            );
            emitStep();
            evidenceIds = ingestResult.createdIds;
            if (evidenceIds.length > 0) {
              await updateMessage(id, userMsg.id, { ingested: { evidenceIds } });
            }
          } catch {
            emitStep();
          }
        } else {
          recorder.add({ kind: 'quick-ingest', label: '用户消息为空，跳过录入', status: 'skipped' });
          emitStep();
        }

        const evidences = await listEvidence(id);

        // read-code
        let code: Awaited<ReturnType<typeof readCodeContext>> | undefined;
        if (kase.meta?.repoPath) {
          try {
            code = await recorder.step(
              'read-code',
              '读取代码上下文',
              () => readCodeContext({ repoPath: kase.meta!.repoPath!, keywords: buildKeywords(kase, evidences) })
            );
            emitStep();
          } catch {
            emitStep();
          }
        } else {
          recorder.add({ kind: 'read-code', label: '未配置代码仓库，跳过', status: 'skipped' });
          emitStep();
        }

        const freshCase = await getCase(id);

        // load-knowledge
        let featureKnowledge: FeatureKnowledge | undefined;
        let relatedCasesForPrompt: { headline?: string; rootCause?: string; fix?: string }[] = [];
        let featureName: string | undefined;

        if (freshCase.featureId) {
          try {
            const feat = await getFeature(freshCase.featureId);
            featureKnowledge = feat.knowledge;
            featureName = feat.name;
            const knowledgeSize = featureKnowledge
              ? featureKnowledge.commonRootCauses.length + featureKnowledge.verifiedFixes.length
              : 0;
            recorder.add({
              kind: 'load-knowledge',
              label: `加载功能知识库 ${knowledgeSize} 条`,
              status: 'ok',
              meta: { knowledgeSize }
            });
          } catch {
            recorder.add({ kind: 'load-knowledge', label: '功能知识库加载失败', status: 'failed' });
          }
        } else {
          recorder.add({ kind: 'load-knowledge', label: '无关联功能，跳过', status: 'skipped' });
        }
        emitStep();

        // find-similar (already loaded from relatedCaseIds)
        recorder.add({ kind: 'find-similar', label: '相似案例已从 Case 关联列表加载', status: 'skipped' });
        emitStep();

        if (freshCase.relatedCaseIds && freshCase.relatedCaseIds.length > 0) {
          for (const rcId of freshCase.relatedCaseIds) {
            try {
              const rc = await getCase(rcId);
              relatedCasesForPrompt.push({
                headline: rc.summary?.headline,
                rootCause: rc.summary?.rootCause,
                fix: rc.summary?.fixApproach
              });
            } catch { /* skip missing */ }
          }
        }

        // load-project-memory: recall relevant memories for this project
        let projectMemoryText = '';
        if (freshCase.projectId) {
          try {
            const query = parsed.data.text || freshCase.problem.actual;
            const ctx = await recorder.step(
              'load-knowledge',
              '加载项目记忆',
              () => buildProjectMemoryContext(freshCase.projectId, query, 2500)
            );
            projectMemoryText = ctx.text;
            emitStep();
          } catch {
            emitStep();
          }
        } else {
          recorder.add({ kind: 'load-knowledge', label: '无关联项目，跳过项目记忆召回', status: 'skipped' });
          emitStep();
        }

        const opts = buildConversationPrompt({
          problem: freshCase.problem,
          meta: freshCase.meta,
          evidences,
          code,
          messages: freshCase.messages ?? [],
          currentSummary: freshCase.summary,
          featureKnowledge,
          relatedCases: relatedCasesForPrompt,
          projectMemoryText
        });

        // Attach images if vision-capable and evidence has attachments
        let imageCount = 0;
        if (modelSupportsVision(cfg)) {
          try {
            const images = await loadImageAttachments(id, evidences);
            if (images.length > 0) {
              opts.images = images;
              imageCount = images.length;
            }
          } catch {
            /* non-fatal */
          }
        }

        const promptChars = opts.userPrompt.length + opts.systemPrompt.length;
        recorder.add({
          kind: 'build-prompt',
          label: imageCount > 0
            ? `构建提示词 ${promptChars} 字符 · ${imageCount} 张图`
            : `构建提示词 ${promptChars} 字符`,
          status: 'ok',
          meta: { promptChars, imageCount }
        });
        emitStep();

        send({
          type: 'context',
          featureName,
          featureKnowledgeSize: featureKnowledge
            ? featureKnowledge.commonRootCauses.length + featureKnowledge.verifiedFixes.length
            : 0,
          relatedCases: relatedCasesForPrompt.map(r => r.headline).filter(Boolean)
        });

        send({
          type: 'meta',
          evidences: evidences.length,
          codeSnippets: code?.snippets.length ?? 0,
          promptChars,
          userMessageId: userMsg.id
        });

        // llm-call
        let fullText = '';
        const startMs = Date.now();
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;

        try {
          await recorder.step(
            'llm-call',
            `调用 LLM (${cfg.model})`,
            async () => {
              for await (const chunk of streamLlm(cfg, opts)) {
                if (chunk.type === 'text') {
                  send(chunk);
                  fullText += chunk.text;
                } else if (chunk.type === 'done') {
                  inputTokens = chunk.inputTokens;
                  outputTokens = chunk.outputTokens;
                  break;
                } else if (chunk.type === 'error') {
                  send(chunk);
                  throw new Error(chunk.message);
                }
              }
            },
            { meta: { model: cfg.model, inputTokens, outputTokens } }
          );
          emitStep();
        } catch (e) {
          emitStep();
          send({ type: 'error', message: (e as Error).message });
          const trace = await recorder.finalize();
          send({ type: 'trace-done', traceId: trace.id, totalMs: trace.totalMs, stepCount: trace.steps.length });
          controller.close();
          return;
        }

        const durationMs = Date.now() - startMs;

        const assistantMsg = await appendMessage(id, {
          role: 'assistant',
          content: fullText,
          meta: { inputTokens, outputTokens, durationMs }
        });

        send({ type: 'done', assistantMessageId: assistantMsg.id, inputTokens, outputTokens });

        // extract-summary
        try {
          const latestCase = await getCase(id);
          const summary = await recorder.step(
            'extract-summary',
            '提取 Bug 摘要',
            () => extractSummary(cfg, {
              problem: latestCase.problem,
              latestAssistantReply: fullText,
              currentSummary: latestCase.summary
            })
          );
          emitStep();
          await updateSummary(id, summary);
          send({ type: 'summary', summary });
        } catch {
          emitStep();
        }

        // update-playbook
        try {
          const caseWithPlaybook = await getCase(id);
          if (caseWithPlaybook.playbook) {
            const updatedPlaybook = await recorder.step(
              'update-playbook',
              '更新 Playbook 进度',
              () => updatePlaybookProgress(cfg, {
                playbook: caseWithPlaybook.playbook!,
                latestUserMessage: parsed.data.text,
                latestAssistantReply: fullText
              }).then(pb => {
                if (!pb) throw new Error('no changes');
                return pb;
              })
            );
            emitStep();
            await updatePlaybook(id, updatedPlaybook);
            send({ type: 'playbook', playbook: updatedPlaybook });
          } else {
            recorder.add({ kind: 'update-playbook', label: '无 Playbook，跳过', status: 'skipped' });
            emitStep();
          }
        } catch {
          emitStep();
        }

        const trace = await recorder.finalize();
        send({ type: 'trace-done', traceId: trace.id, totalMs: trace.totalMs, stepCount: trace.steps.length });
      } catch (e) {
        send({ type: 'error', message: (e as Error).message });
        try {
          const trace = await recorder.finalize();
          send({ type: 'trace-done', traceId: trace.id, totalMs: trace.totalMs, stepCount: trace.steps.length });
        } catch { /* ignore */ }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    }
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  return Response.json({
    messages: kase.messages ?? [],
    summary: kase.summary
  });
}
