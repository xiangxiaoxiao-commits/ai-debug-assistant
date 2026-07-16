import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCase, updateCase } from '@/server/case-store';
import { getFeature } from '@/server/feature-store';
import { upsertIndexEntry } from '@/server/index-store';

const patchBodySchema = z.object({
  featureId: z.string().uuid()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const feature = await getFeature(parsed.data.featureId).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'feature not found' }, { status: 404 });

  const updated = await updateCase({ ...kase, featureId: feature.id });
  await upsertIndexEntry(updated, feature.name);

  return NextResponse.json({ case: updated });
}
