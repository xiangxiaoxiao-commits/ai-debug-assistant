'use client';
import { useState } from 'react';
import type { Case, Evidence, EvidenceType } from '@/domain/types';
import { EvidenceCard } from './evidence-card';
import { EvidenceAddDialog } from './evidence-add-dialog';

interface Props {
  currentCase: Case;
  evidence: Evidence[];
  onAdd: (type: EvidenceType, content: string) => Promise<void>;
  onDelete: (evidenceId: string) => Promise<void>;
}

const LEVEL_COLOR: Record<Case['evidenceLevel'], string> = {
  L0: 'text-slate-400',
  L1: 'text-blue-400',
  L2: 'text-emerald-400',
  L3: 'text-emerald-300'
};

export function EvidencePanel({ currentCase, evidence, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-400">证据</div>
        <span className={`text-xs font-semibold ${LEVEL_COLOR[currentCase.evidenceLevel]}`}>
          Level {currentCase.evidenceLevel}
        </span>
        <div className="flex-1" />
        <button className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
          onClick={() => setOpen(true)}>+ 添加证据</button>
      </div>
      <p className="text-[10px] text-slate-500">
        L0 描述 → L1 工单/页面 → L2 API 证据 → L3 API + 代码 + Schema
      </p>
      {evidence.length === 0
        ? <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded">
            尚无证据。点「添加证据」开始收集。
          </div>
        : <div className="space-y-2">
            {evidence.map(e => <EvidenceCard key={e.id} evidence={e} onDelete={onDelete} />)}
          </div>}
      <EvidenceAddDialog open={open} onClose={() => setOpen(false)} onSubmit={onAdd} />
    </div>
  );
}
