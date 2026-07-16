'use client';
import type { Project } from '@/domain/memory';

interface Props {
  projects: Project[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

export function ProjectSelector({ projects, selectedId, loading, onSelect }: Props) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-slate-400 block mb-1">项目</label>
      {loading ? (
        <div className="text-xs text-slate-500">加载中…</div>
      ) : projects.length === 0 ? (
        <div className="text-xs text-slate-500 italic">暂无项目</div>
      ) : (
        <select
          value={selectedId ?? ''}
          onChange={e => e.target.value && onSelect(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="">— 选择项目 —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.repoPath ? ` (${p.repoPath.split('/').slice(-2).join('/')})` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
