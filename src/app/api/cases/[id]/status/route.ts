import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCase, updateCaseStatus, updateSummary } from '@/server/case-store';
import { bugStatusSchema } from '@/domain/schemas';

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

  await updateCaseStatus(id, parsed.data.status);

  // Apply verificationNotes if provided
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
  return Response.json({ summary: updated.summary });
}
