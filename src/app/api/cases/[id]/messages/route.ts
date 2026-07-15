import { NextRequest } from 'next/server';
import { z } from 'zod';
import { readSavedConfig } from '@/server/config-store';
import { getCase, appendMessage, updateMessage, updateSummary } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { readCodeContext } from '@/server/code-reader';
import { quickIngest } from '@/server/quick-ingest';
import { buildConversationPrompt } from '@/server/prompt-builder';
import { streamLlm } from '@/server/llm-client';
import { extractSummary } from '@/server/summary-extractor';
import type { Case, Evidence } from '@/domain/types';

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

  // Append user message
  const userMsg = await appendMessage(id, {
    role: 'user',
    content: parsed.data.text || kase.problem.actual
  });

  // Quick-ingest any text into evidence (only if non-empty)
  let evidenceIds: string[] = [];
  if (parsed.data.text.trim()) {
    const ingestResult = await quickIngest(id, parsed.data.text).catch(() => ({ createdIds: [] }));
    evidenceIds = ingestResult.createdIds;
    if (evidenceIds.length > 0) {
      await updateMessage(id, userMsg.id, { ingested: { evidenceIds } });
    }
  }

  // Collect evidence and code context
  const evidences = await listEvidence(id);
  const code = kase.meta?.repoPath
    ? await readCodeContext({
        repoPath: kase.meta.repoPath,
        keywords: buildKeywords(kase, evidences)
      })
    : undefined;

  // Re-read case to get latest messages (including user msg)
  const freshCase = await getCase(id);
  const opts = buildConversationPrompt({
    problem: freshCase.problem,
    meta: freshCase.meta,
    evidences,
    code,
    messages: freshCase.messages ?? [],
    currentSummary: freshCase.summary
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({
          type: 'meta',
          evidences: evidences.length,
          codeSnippets: code?.snippets.length ?? 0,
          promptChars: opts.userPrompt.length + opts.systemPrompt.length,
          userMessageId: userMsg.id
        });

        let fullText = '';
        const startMs = Date.now();
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;

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
            break;
          }
        }

        const durationMs = Date.now() - startMs;

        // Store assistant message
        const assistantMsg = await appendMessage(id, {
          role: 'assistant',
          content: fullText,
          meta: { inputTokens, outputTokens, durationMs }
        });

        send({ type: 'done', assistantMessageId: assistantMsg.id, inputTokens, outputTokens });

        // Extract summary and update (fire-and-forget from caller's perspective,
        // but we run it here after done so client may still receive the summary event)
        try {
          const latestCase = await getCase(id);
          const summary = await extractSummary(cfg, {
            problem: latestCase.problem,
            latestAssistantReply: fullText,
            currentSummary: latestCase.summary
          });
          await updateSummary(id, summary);
          send({ type: 'summary', summary });
        } catch {
          // summary extraction failure is non-fatal
        }
      } catch (e) {
        send({ type: 'error', message: (e as Error).message });
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
