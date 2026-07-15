'use client';
import { useState } from 'react';
import type { CaseIndexEntry, BugStatus } from '@/domain/types';

const STATUS_DOT: Record<BugStatus, string> = {
  'open':          'bg-slate-400',
  'investigating': 'bg-yellow-400',
  'resolved':      'bg-emerald-400',
  'wont-fix':      'bg-slate-600'
};
const STATUS_LABEL: Record<BugStatus, string> = {
  'open':          '待分析',
  'investigating': '排查中',
  'resolved':      '已解决',
  'wont-fix':      '搁置'
};

type Filter = 'all' | BugStatus;

interface Props {
  cases: CaseIndexEntry[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function BugList({ cases, activeId, onSelect, onDelete, onNew }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts: Record<Filter, number> = {
    all: cases.length,
    'open': 0, 'investigating': 0, 'resolved': 0, 'wont-fix': 0
  };
  for (const c of cases) {
    if (c.bugStatus) counts[c.bugStatus] += 1;
  }
  const visible = filter === 'all' ? cases : cases.filter(c => c.bugStatus === filter);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs uppercase tracking-wide text-slate-400">Bug 列表</div>
        <div className="flex-1" />
        <button
          onClick={onNew}
          className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500"
        >+ 新建</button>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {(['all', 'open', 'investigating', 'resolved', 'wont-fix'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              filter === f
                ? 'bg-blue-900/60 border-blue-700 text-blue-100'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {f === 'all' ? '全部' : STATUS_LABEL[f]} · {counts[f]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto -mx-1">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-500 px-1 py-4">没有匹配的 Bug</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map(c => {
              const status: BugStatus = c.bugStatus ?? 'open';
              return (
                <li
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group px-2 py-1.5 rounded cursor-pointer border ${
                    activeId === c.id
                      ? 'bg-slate-700/60 border-slate-600'
                      : 'border-transparent hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT[status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200 line-clamp-2">
                        {c.headline || c.title}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                        {STATUS_LABEL[status]} · {relTime(c.updatedAt || c.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-300"
                    >删除</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString();
}
