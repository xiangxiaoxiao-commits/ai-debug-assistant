import type { EvidenceType } from '@/domain/types';
import { addEvidence } from './evidence-store';

/** Split text on blank lines (one or more empty lines between blocks) */
function splitByBlankLine(text: string): string[] {
  return text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
}

/** Detect evidence type from a text chunk */
function detectType(chunk: string): EvidenceType {
  const first = chunk.trimStart();

  // curl block: first non-whitespace line starts with 'curl '
  if (/^curl\s+/im.test(first.split('\n')[0])) return 'curl';

  // JSON blob: starts with { or [
  if (/^\s*[{[]/.test(first)) {
    try {
      JSON.parse(first);
      return 'api-response';
    } catch {
      // Not valid JSON, might still look like JSON
      if (/^\s*\{/.test(first) && /["']\s*:/.test(first)) return 'api-response';
    }
  }

  // SQL schema: contains CREATE TABLE / ALTER TABLE / CREATE INDEX
  if (/\b(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+TABLE)\b/i.test(first)) {
    return 'schema-sql';
  }

  // Log / stacktrace: contains ERROR/WARN/Exception/at com./at org.
  if (
    /\b(ERROR|WARN|FATAL)\b/.test(first) ||
    /\bException\b/.test(first) ||
    /^\s+at\s+[\w$.]+\(/m.test(first) ||
    /\bstackTrace\b/i.test(first)
  ) {
    return 'log';
  }

  // URL alone on a line
  if (/^https?:\/\/\S+$/.test(first.split('\n')[0].trim())) return 'page-url';

  // Fallback
  return 'free-text';
}

export async function quickIngest(caseId: string, text: string): Promise<{ createdIds: string[] }> {
  const chunks = splitByBlankLine(text);
  const created: string[] = [];
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (!t) continue;
    const type = detectType(t);
    const ev = await addEvidence(caseId, { type, content: t });
    created.push(ev.id);
  }
  return { createdIds: created };
}
