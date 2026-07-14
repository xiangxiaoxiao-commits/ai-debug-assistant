'use client';
import { useState } from 'react';
import { api, type CreateCasePayload } from '@/client/api';

export function CaseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [problem, setProblem] = useState({ actual: '', expected: '', entry: '', environment: '' });
  const [meta, setMeta] = useState({ module: '', repoPath: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateCasePayload = {
        problem,
        meta: {
          ...(meta.module ? { module: meta.module } : {}),
          ...(meta.repoPath ? { repoPath: meta.repoPath } : {})
        }
      };
      const { case: created } = await api.createCase(payload);
      onCreated(created.id);
      setProblem({ actual: '', expected: '', entry: '', environment: '' });
      setMeta({ module: '', repoPath: '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const Row = ({ label, value, onChange, textarea = false }: {
    label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
  }) => (
    <label className="block space-y-1">
      <span className="text-xs text-slate-400">{label}</span>
      {textarea ? (
        <textarea rows={2} className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={value} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  );

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">新建 Case</div>
      <Row label="Actual behavior *" value={problem.actual} onChange={v => setProblem({ ...problem, actual: v })} textarea />
      <Row label="Expected behavior *" value={problem.expected} onChange={v => setProblem({ ...problem, expected: v })} textarea />
      <Row label="Entry *" value={problem.entry} onChange={v => setProblem({ ...problem, entry: v })} />
      <Row label="Environment *" value={problem.environment} onChange={v => setProblem({ ...problem, environment: v })} />
      <Row label="Module (可选)" value={meta.module} onChange={v => setMeta({ ...meta, module: v })} />
      <Row label="Repo path (可选)" value={meta.repoPath} onChange={v => setMeta({ ...meta, repoPath: v })} />
      {error && <div className="text-xs text-rose-400">{error}</div>}
      <button disabled={submitting}
        onClick={submit}
        className="w-full text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-1.5">
        {submitting ? '创建中...' : '创建 Case'}
      </button>
    </div>
  );
}
