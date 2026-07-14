'use client';
import { useState } from 'react';
import type { Evidence } from '@/domain/types';

interface Props {
  evidence: Evidence;
  onDelete: (id: string) => void;
}

export function EvidenceCard({ evidence, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-800 rounded p-2 space-y-1 bg-slate-900/60">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">{evidence.type}</span>
        <span className="text-xs text-slate-400">{new Date(evidence.createdAt).toLocaleTimeString()}</span>
        <span className="text-[10px] text-slate-500">~{evidence.summary.tokensEstimate} tok</span>
        <div className="flex-1" />
        <button className="text-[10px] text-slate-400 hover:text-slate-200"
          onClick={() => setExpanded(v => !v)}>{expanded ? '折叠' : '展开'}</button>
        <button className="text-[10px] text-rose-400 hover:text-rose-300"
          onClick={() => onDelete(evidence.id)}>删除</button>
      </div>
      <div className="text-xs text-slate-300 truncate">{evidence.summary.oneLine}</div>
      {evidence.summary.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.summary.keywords.slice(0, 8).map(k => (
            <span key={k} className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-400">{k}</span>
          ))}
        </div>
      )}
      {expanded && (
        <pre className="mt-1 text-[11px] bg-slate-950/70 border border-slate-800 rounded p-2 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {evidence.raw.content}
        </pre>
      )}
    </div>
  );
}
