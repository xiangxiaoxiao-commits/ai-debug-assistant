import { NextRequest, NextResponse } from 'next/server';
import { getFeature } from '@/server/feature-store';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await getFeature(id).catch(() => null);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const feature = await refreshFeatureKnowledge(id);
  return NextResponse.json({ feature });
}
