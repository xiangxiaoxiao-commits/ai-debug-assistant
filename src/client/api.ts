'use client';
import type { Case, Evidence, CaseIndexEntry, EvidenceType, Message, BugSummary, BugStatus } from '@/domain/types';
import type { ModelConfig, ModelCandidate } from '@/domain/model-config';

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
  exportCase: (id: string) => `/api/cases/${id}/export`,
  discoverConfig: () =>
    fetch('/api/config/discover').then(j<{ candidates: ModelCandidate[]; saved: { provider: string; baseUrl: string; model: string; apiKeyMasked: string } | null }>),
  revealCandidate: (candidateId: string) =>
    fetch('/api/config/reveal', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ candidateId })
    }).then(j<ModelConfig>),
  saveModelConfig: (cfg: ModelConfig) =>
    fetch('/api/config/model', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg)
    }).then(j<{ config: ModelConfig }>),
  loadSavedModelConfig: () =>
    fetch('/api/config/model').then(j<{ config: ModelConfig | null }>),
  quickIngest: (caseId: string, text: string) =>
    fetch(`/api/cases/${caseId}/quick-ingest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text })
    }).then(j<{ createdIds: string[] }>),
  getMessages: (caseId: string) =>
    fetch(`/api/cases/${caseId}/messages`).then(j<{ messages: Message[]; summary: BugSummary }>),
  patchStatus: (caseId: string, body: { status: BugStatus; verificationNotes?: string }) =>
    fetch(`/api/cases/${caseId}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(j<{ summary: BugSummary }>),
  sendMessage: async function* (caseId: string, text: string): AsyncGenerator<MessageChunk> {
    const res = await fetch(`/api/cases/${caseId}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text })
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        try { yield JSON.parse(line.slice(6)) as MessageChunk; } catch { /* skip malformed */ }
      }
    }
  }
};

export type MessageChunk =
  | { type: 'meta'; evidences: number; codeSnippets: number; promptChars: number; userMessageId: string }
  | { type: 'text'; text: string }
  | { type: 'summary'; summary: BugSummary }
  | { type: 'error'; message: string }
  | { type: 'done'; assistantMessageId?: string; inputTokens?: number; outputTokens?: number };
