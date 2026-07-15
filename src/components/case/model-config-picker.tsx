'use client';
import type { ModelCandidate } from '@/domain/model-config';

interface Props {
  candidates: ModelCandidate[];
  onPick: (candidate: ModelCandidate) => void;
}

export function ModelConfigPicker({ candidates, onPick }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-300">
        自动检测到 {candidates.length} 份配置，选一份使用：
      </p>
      <ul className="space-y-1">
        {candidates.map(c => (
          <li key={c.id} className="bg-slate-800 rounded p-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-slate-200">{c.provider}</span>
                <span className="text-[10px] bg-slate-700 text-slate-400 rounded px-1">{c.sourceLabel}</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">{c.baseUrl}</div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">{c.apiKeyMasked}</div>
            </div>
            <button
              onClick={() => onPick(c)}
              className="shrink-0 text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
            >
              使用此配置
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
