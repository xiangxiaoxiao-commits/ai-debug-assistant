import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { attachmentsDir } from '@/server/paths';
import { listEvidence } from '@/server/evidence-store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;

  // Find the attachment across all evidence of this case (we don't index them
  // separately). This is O(n_evidence) but n_evidence is small per case.
  const evidences = await listEvidence(id);
  let match: { mediaType: string; path: string } | null = null;
  for (const e of evidences) {
    for (const att of e.attachments ?? []) {
      if (att.id === attachmentId) {
        match = { mediaType: att.mediaType, path: att.path };
        break;
      }
    }
    if (match) break;
  }
  if (!match) {
    return NextResponse.json({ error: 'attachment not found' }, { status: 404 });
  }

  const abs = path.join(attachmentsDir(id), match.path);
  try {
    const buf = await fs.readFile(abs);
    // Node Buffer works as a BodyInit in the fetch/undici runtime Next uses.
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': match.mediaType,
        'cache-control': 'private, max-age=3600'
      }
    });
  } catch {
    return NextResponse.json({ error: 'attachment file missing on disk' }, { status: 410 });
  }
}
