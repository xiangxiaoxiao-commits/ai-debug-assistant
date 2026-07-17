import fs from 'node:fs/promises';
import path from 'node:path';
import type { Evidence } from '@/domain/types';
import type { LlmImage } from './llm-client';
import { attachmentsDir } from './paths';

const DEFAULT_MAX_IMAGES = 6;
const DEFAULT_MAX_TOTAL_BYTES = 12 * 1024 * 1024;   // ~12 MB / request

/** Load image attachments from a list of evidences into LlmImage objects
 *  suitable for the LLM client's multimodal path.  Silently drops images
 *  that can't be read; caps at maxImages and maxTotalBytes to avoid
 *  overwhelming the model. */
export async function loadImageAttachments(
  caseId: string,
  evidences: Evidence[],
  opts?: { maxImages?: number; maxTotalBytes?: number }
): Promise<LlmImage[]> {
  const maxImages = opts?.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxTotal = opts?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const out: LlmImage[] = [];
  let total = 0;
  const dir = attachmentsDir(caseId);

  outer: for (const e of evidences) {
    for (const att of e.attachments ?? []) {
      if (att.kind !== 'image') continue;
      if (out.length >= maxImages) break outer;
      if (total + att.sizeBytes > maxTotal) continue;   // skip this one, try smaller ones later

      const abs = path.join(dir, att.path);
      try {
        const buf = await fs.readFile(abs);
        out.push({ mediaType: att.mediaType, base64: buf.toString('base64') });
        total += buf.byteLength;
      } catch {
        // attachment file missing — skip silently
      }
    }
  }
  return out;
}
