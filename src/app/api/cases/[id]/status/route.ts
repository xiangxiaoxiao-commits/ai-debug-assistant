import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCase, updateCase, updateCaseStatus, updateSummary } from '@/server/case-store';
import { bugStatusSchema } from '@/domain/schemas';
import { readSavedConfig } from '@/server/config-store';
import { incrementFeatureStats } from '@/server/feature-store';
import { extractLesson } from '@/server/lesson-extractor';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

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

  // Fire-and-forget: handle feature side effects
  if (kase.featureId) {
    const featureId = kase.featureId;
    const isTransitionToResolved = parsed.data.status === 'resolved' && prevStatus !== 'resolved';
    const isTransitionFromResolved = prevStatus === 'resolved' && parsed.data.status !== 'resolved';

    void (async () => {
      try {
        if (isTransitionToResolved) {
          await incrementFeatureStats(featureId, { resolved: 1 });
          const cfg = await readSavedConfig();
          if (cfg) {
            const freshCase = await getCase(id);
            const lesson = await extractLesson(cfg, {
              kase: freshCase,
              messages: freshCase.messages ?? []
            }).catch(() => null);
            if (lesson) {
              await updateCase({ ...freshCase, lessons: lesson });
            }
            await refreshFeatureKnowledge(featureId, cfg);
          }
        } else if (isTransitionFromResolved) {
          await incrementFeatureStats(featureId, { resolved: -1 });
          const cfg = await readSavedConfig();
          if (cfg) {
            await refreshFeatureKnowledge(featureId, cfg);
          }
        }
      } catch {
        // non-fatal — feature side effects never block status update
      }
    })();
  }

  return Response.json({ summary: updated.summary });
}
