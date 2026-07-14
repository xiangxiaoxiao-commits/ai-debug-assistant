'use client';
import type { Case, Evidence, CaseIndexEntry, EvidenceType } from '@/domain/types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error?.formErrors?.[0] ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateCasePayload {
  problem: { actual: string; expected: string; entry: string; environment: string };
  meta?: { module?: string; repoPath?: string; priority?: 'P0' | 'P1' | 'P2' | 'P3' };
}

export const api = {
  listCases: () => fetch('/api/cases').then(j<{ cases: CaseIndexEntry[] }>),
  createCase: (payload: CreateCasePayload) =>
    fetch('/api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(j<{ case: Case }>),
  getCase: (id: string) => fetch(`/api/cases/${id}`).then(j<{ case: Case; evidence: Evidence[] }>),
  deleteCase: (id: string) => fetch(`/api/cases/${id}`, { method: 'DELETE' }).then(j<{ deleted: string }>),
  addEvidence: (id: string, body: { type: EvidenceType; content: string; filename?: string }) =>
    fetch(`/api/cases/${id}/evidence`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(j<{ evidence: Evidence; case: Case }>),
  deleteEvidence: (caseId: string, evidenceId: string) =>
    fetch(`/api/cases/${caseId}/evidence/${evidenceId}`, { method: 'DELETE' }).then(j<{ case: Case }>),
  exportCase: (id: string) => `/api/cases/${id}/export`
};
