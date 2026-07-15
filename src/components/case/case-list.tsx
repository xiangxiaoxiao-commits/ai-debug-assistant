'use client';
import type { CaseIndexEntry } from '@/domain/types';

interface Props {
  cases: CaseIndexEntry[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CaseList({ cases, activeId, onSelect, onDelete }: Props) {
  if (cases.length === 0) {
    return <p className="text-xs text-slate-500">暂无 Case，从上方新建一个开始</p>;
  }
  return (
    <ul className="space-y-1">
      {cases.map(c => (
        <li key={c.id}
          className={`group flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${activeId === c.id ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'}`}
          onClick={() => onSelect(c.id)}>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{c.title}</div>
            <div className="text-[10px] text-slate-500">{c.status} · {new Date(c.createdAt).toLocaleString()}</div>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-300"
            onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}>删除</button>
        </li>
      ))}
    </ul>
  );
}
