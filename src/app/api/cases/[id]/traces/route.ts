import { NextRequest, NextResponse } from 'next/server';
import { getCase, listTraces } from '@/server/case-store';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });

  const traces = await listTraces(id);
  return NextResponse.json({ traces });
}
