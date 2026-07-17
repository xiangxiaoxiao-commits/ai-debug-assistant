import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { attachmentsDir, caseFile } from '@/server/paths';
import { ensureDir, fileExists } from '@/server/fs-atomic';
import { addImageEvidence } from '@/server/evidence-store';
import type { EvidenceAttachment } from '@/domain/types';

export const dynamic = 'force-dynamic';

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;   // 20 MB per request
const MAX_PER_FILE   = 8 * 1024 * 1024;      // 8 MB per file
const ALLOWED_TYPES: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif':  'gif'
};

/** POST multipart/form-data with 1..N `images` fields + optional `description` */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await fileExists(caseFile(id)))) {
    return NextResponse.json({ error: 'case not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
  }

  const description = (form.get('description') as string | null) ?? '';
  const files = form.getAll('images').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no image files provided (field name must be "images")' }, { status: 400 });
  }

  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > MAX_PER_FILE) {
      return NextResponse.json({ error: `file too large: ${f.name} (${f.size} bytes, max ${MAX_PER_FILE})` }, { status: 413 });
    }
    if (!ALLOWED_TYPES[f.type]) {
      return NextResponse.json({ error: `unsupported media type: ${f.type} (allowed: ${Object.keys(ALLOWED_TYPES).join(', ')})` }, { status: 415 });
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: `total upload too large: ${total} bytes, max ${MAX_TOTAL_BYTES}` }, { status: 413 });
  }

  const dir = attachmentsDir(id);
  await ensureDir(dir);

  const attachments: EvidenceAttachment[] = [];
  for (const f of files) {
    const attId = uuid();
    const ext = ALLOWED_TYPES[f.type];
    const rel = `${attId}.${ext}`;
    const abs = path.join(dir, rel);
    const buf = Buffer.from(await f.arrayBuffer());
    await fs.writeFile(abs, buf);
    attachments.push({
      id: attId,
      kind: 'image',
      mediaType: f.type,
      filename: f.name || undefined,
      sizeBytes: f.size,
      path: rel
    });
  }

  const evidence = await addImageEvidence(id, { attachments, description });

  return NextResponse.json({ evidence }, { status: 201 });
}
