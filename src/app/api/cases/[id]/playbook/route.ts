import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCase, updatePlaybook } from '@/server/case-store';
import { playbookStepSchema } from '@/domain/schemas';
import type { Playbook } from '@/domain/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });
  return NextResponse.json({ playbook: kase.playbook ?? null });
}

const putBodySchema = z.object({
  steps: z.array(playbookStepSchema)
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date().toISOString();
  const playbook: Playbook = {
    steps: parsed.data.steps.map(s => ({ ...s, updatedBy: 'user' as const })),
    source: 'user',
    updatedAt: now
  };

  await updatePlaybook(id, playbook);
  return NextResponse.json({ playbook });
}

const patchBodySchema = z.object({
  stepId: z.string(),
  patch: z.object({
    status: z.enum(['todo', 'doing', 'done', 'skipped']).optional(),
    notes: z.string().optional(),
    title: z.string().optional(),
    hint: z.string().optional()
  })
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });
  if (!kase.playbook) return NextResponse.json({ error: 'no playbook' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { stepId, patch } = parsed.data;
  const now = new Date().toISOString();

  const steps = kase.playbook.steps.map(s =>
    s.id === stepId
      ? { ...s, ...patch, updatedAt: now, updatedBy: 'user' as const }
      : s
  );

  if (!steps.some(s => s.id === stepId)) {
    return NextResponse.json({ error: 'step not found' }, { status: 404 });
  }

  const playbook: Playbook = { ...kase.playbook, steps, updatedAt: now };
  await updatePlaybook(id, playbook);
  return NextResponse.json({ playbook });
}
