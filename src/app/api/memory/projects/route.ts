import { NextRequest, NextResponse } from 'next/server';
import { createProjectInputSchema } from '@/domain/memory';
import { listProjects, createProject, findProjectByRepoPath } from '@/memory/project-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }); }
  const parsed = createProjectInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  // idempotent-ish: if repoPath already known, return existing
  if (parsed.data.repoPath) {
    const existing = await findProjectByRepoPath(parsed.data.repoPath);
    if (existing) return NextResponse.json({ project: existing, reused: true }, { status: 200 });
  }
  const project = await createProject(parsed.data);
  return NextResponse.json({ project }, { status: 201 });
}
