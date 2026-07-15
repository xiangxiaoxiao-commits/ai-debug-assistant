import { NextRequest } from 'next/server';
import { z } from 'zod';
import { readSavedConfig } from '@/server/config-store';
import { listEvidence } from '@/server/evidence-store';
import { getCase } from '@/server/case-store';
import { readCodeContext } from '@/server/code-reader';
import { buildAnalyzePrompt } from '@/server/prompt-builder';
import { streamLlm } from '@/server/llm-client';
import type { Case, Evidence } from '@/domain/types';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  caseId: z.string().uuid()
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

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const cfg = await readSavedConfig();
  if (!cfg) return new Response('model not configured', { status: 400 });

  const kase = await getCase(parsed.data.caseId).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  const evidences = await listEvidence(kase.id);
  const code = kase.meta?.repoPath
    ? await readCodeContext({
        repoPath: kase.meta.repoPath,
        keywords: buildKeywords(kase, evidences)
      })
    : undefined;
  const opts = buildAnalyzePrompt({ problem: kase.problem, meta: kase.meta, evidences, code });

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
          promptChars: opts.userPrompt.length + opts.systemPrompt.length
        });
        for await (const chunk of streamLlm(cfg, opts)) {
          send(chunk);
          if (chunk.type === 'done' || chunk.type === 'error') break;
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
