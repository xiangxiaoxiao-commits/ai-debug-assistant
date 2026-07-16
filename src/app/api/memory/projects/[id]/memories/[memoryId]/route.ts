import { NextRequest, NextResponse } from 'next/server';
import { updateMemoryInputSchema } from '@/domain/memory';
import { getMemory, updateMemory, forget } from '@/memory/memory-store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; memoryId: string }> }) {
  const { id, memoryId } = await params;
  try {
    const memory = await getMemory(id, memoryId);
    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ error: 'memory not found' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; memoryId: string }> }) {
  const { id, memoryId } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }); }
  const parsed = updateMemoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const memory = await updateMemory(id, memoryId, parsed.data);
    return NextResponse.json({ memory });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; memoryId: string }> }) {
  const { id, memoryId } = await params;
  await forget(id, memoryId);
  return NextResponse.json({ deleted: memoryId });
}
