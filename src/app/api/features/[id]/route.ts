import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFeature, updateFeature } from '@/server/feature-store';
import { listCases } from '@/server/case-store';

const patchBodySchema = z.object({
  name: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional()
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await getFeature(id).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const allCases = await listCases();
  const resolvedCases = allCases
    .filter(c => c.featureId === id && c.summary?.status === 'resolved')
    .map(c => ({ id: c.id, headline: c.summary?.headline }));

  return NextResponse.json({ feature, resolvedCases });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await getFeature(id).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const updated = await updateFeature({
    ...feature,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.aliases !== undefined ? { aliases: parsed.data.aliases } : {})
  });

  return NextResponse.json({ feature: updated });
}
