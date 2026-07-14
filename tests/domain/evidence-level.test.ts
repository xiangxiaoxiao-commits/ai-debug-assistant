import { describe, it, expect } from 'vitest';
import { v4 as uuid } from 'uuid';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import type { Evidence, EvidenceType } from '@/domain/types';

function mkEvidence(type: EvidenceType, id: string = uuid()): Evidence {
  return {
    id, caseId: '00000000-0000-0000-0000-000000000000', type,
    createdAt: new Date().toISOString(), source: 'user-paste',
    raw: { content: 'x', sizeBytes: 1 },
    summary: { oneLine: 'x', keywords: [], tokensEstimate: 1 }
  };
}

describe('calculateEvidenceLevel', () => {
  it('无证据 → L0', () => {
    expect(calculateEvidenceLevel([])).toBe('L0');
  });
  it('仅 ticket-text → L1', () => {
    expect(calculateEvidenceLevel([mkEvidence('ticket-text')])).toBe('L1');
  });
  it('仅 page-url → L1', () => {
    expect(calculateEvidenceLevel([mkEvidence('page-url')])).toBe('L1');
  });
  it('ticket + curl → L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('ticket-text'), mkEvidence('curl')])).toBe('L2');
  });
  it('仅 curl（跳过 L1）→ L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('curl')])).toBe('L2');
  });
  it('curl + repo-path + schema-sql → L3', () => {
    expect(calculateEvidenceLevel([
      mkEvidence('curl'), mkEvidence('repo-path'), mkEvidence('schema-sql')
    ])).toBe('L3');
  });
  it('curl + repo-path 无 schema → L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('curl'), mkEvidence('repo-path')])).toBe('L2');
  });
});
