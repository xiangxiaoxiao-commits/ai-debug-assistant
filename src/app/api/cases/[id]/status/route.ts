import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCase, updateCase, updateCaseStatus, updateSummary } from '@/server/case-store';
import { bugStatusSchema } from '@/domain/schemas';
import { readSavedConfig } from '@/server/config-store';
import { incrementFeatureStats } from '@/server/feature-store';
import { extractLesson } from '@/server/lesson-extractor';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';
import { promoteLessonToMemory } from '@/server/memory-integration';

export const dynamic = 'force-dynamic';

const patchBodySchema = z.object({
  status: bugStatusSchema,
  verificationNotes: z.string().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const raw = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  const prevStatus = kase.summary?.status;
  await updateCaseStatus(id, parsed.data.status);

  if (parsed.data.verificationNotes !== undefined) {
    const fresh = await getCase(id);
    if (fresh.summary) {
      await updateSummary(id, {
        ...fresh.summary,
        verificationNotes: parsed.data.verificationNotes,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user'
      });
    }
  }

  const updated = await getCase(id);

  const isTransitionToResolved = parsed.data.status === 'resolved' && prevStatus !== 'resolved';
  const isTransitionFromResolved = prevStatus === 'resolved' && parsed.data.status !== 'resolved';

  // Fire-and-forget: feature stats + knowledge refresh + memory promotion.
  // Runs regardless of whether the case has a featureId; only the feature-
  // specific work is scoped by `if (featureId)`.
  void (async () => {
    try {
      const cfg = await readSavedConfig();
      const featureId = kase.featureId;

      if (isTransitionToResolved) {
        if (featureId) await incrementFeatureStats(featureId, { resolved: 1 });
        if (!cfg) return;

        const freshCase = await getCase(id);
        const lesson = await extractLesson(cfg, {
          kase: freshCase,
          messages: freshCase.messages ?? []
        }).catch(() => null);
        if (lesson) {
          await updateCase({ ...freshCase, lessons: lesson });
        }
        if (featureId) await refreshFeatureKnowledge(featureId, cfg);

        // Promote to project-level memory (semantic + procedural)
        if (freshCase.projectId) {
          await promoteLessonToMemory(cfg, {
            projectId: freshCase.projectId,
            problem: freshCase.problem,
            rootCause: freshCase.summary?.rootCause ?? lesson?.rootCause,
            fix: freshCase.summary?.fixApproach ?? lesson?.fix,
            caseId: id
          }).catch(() => ({ added: 0, reinforced: 0 }));
        }
      } else if (isTransitionFromResolved) {
        if (featureId) await incrementFeatureStats(featureId, { resolved: -1 });
        if (cfg && featureId) {
          await refreshFeatureKnowledge(featureId, cfg);
        }
      }
    } catch {
      // non-fatal — side effects never block status update
    }
  })();

  return Response.json({ summary: updated.summary });
}
