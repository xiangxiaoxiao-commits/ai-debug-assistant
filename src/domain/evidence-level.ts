import type { Evidence, EvidenceLevel, EvidenceType } from './types';

const L1_TYPES: EvidenceType[] = ['ticket-text', 'page-url', 'screenshot-note'];
const L2_TYPES: EvidenceType[] = ['curl', 'har', 'api-response'];
const CODE_TYPES: EvidenceType[] = ['repo-path'];
const SCHEMA_TYPES: EvidenceType[] = ['schema-sql'];

function has(evs: Evidence[], types: EvidenceType[]): boolean {
  return evs.some((e) => types.includes(e.type));
}

export function calculateEvidenceLevel(evidences: Evidence[]): EvidenceLevel {
  const hasL2 = has(evidences, L2_TYPES);
  const hasL1 = has(evidences, L1_TYPES);
  const hasCode = has(evidences, CODE_TYPES);
  const hasSchema = has(evidences, SCHEMA_TYPES);

  if (hasL2 && hasCode && hasSchema) return 'L3';
  if (hasL2) return 'L2';
  if (hasL1) return 'L1';
  return 'L0';
}
