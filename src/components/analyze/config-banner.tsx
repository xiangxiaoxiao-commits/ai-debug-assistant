'use client';
import { useState } from 'react';
import type { ModelCandidate } from '@/domain/model-config';
import { api } from '@/client/api';

interface Props {
  candidates: ModelCandidate[];
  onConfigured: () => void;
  onOpenSettings: () => void;
}

export function ConfigBanner({ candidates, onConfigured, onOpenSettings }: Props) {
  const [modelName, setModelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickedIdx, setPickedIdx] = useState(0);
  const picked = candidates[pickedIdx];

  const useIt = async () => {
    if (!picked) return;
    setErr(null);
    if (!modelName.trim() && !picked.model) {
      setErr('请填写模型名称，例如 claude-sonnet-4-5 或 deepseek-chat');
      return;
    }
    setSaving(true);
    try {
      const full = await api.revealCandidate(picked.id);
      await api.saveModelConfig({
        provider: full.provider,
        baseUrl: full.baseUrl,
        apiKey: full.apiKey,
        model: modelName.trim() || picked.model || ''
      });
      onConfigured();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="mb-4 border border-amber-800 bg-amber-950/30 rounded p-3 flex items-center gap-3 text-sm">
        <span className="text-amber-400">⚙</span>
        <span className="flex-1">未检测到本地模型配置</span>
        <button
          onClick={onOpenSettings}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
        >
          手动填写
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 border border-blue-900 bg-blue-950/30 rounded p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-blue-400">⚙</span>
        <span className="flex-1">
          检测到 {candidates.length} 份本地配置，选一份填上模型名即可开始
        </span>
        <button
          onClick={onOpenSettings}
          className="text-xs text-slate-400 hover:text-slate-200 underline"
        >
          手动填写
        </button>
      </div>

      {candidates.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {candidates.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setPickedIdx(i)}
              className={`text-[11px] px-2 py-0.5 rounded border ${
                i === pickedIdx
                  ? 'bg-blue-800 border-blue-500 text-blue-100'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {c.sourceLabel}
            </button>
          ))}
        </div>
      )}

      <div className="text-[11px] text-slate-400">
        {picked.sourceLabel} · {picked.provider} · {picked.baseUrl} · Key {picked.apiKeyMasked}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-600"
          placeholder={picked.model ? `已知模型名：${picked.model}` : '模型名，如 claude-sonnet-4-5 / deepseek-chat / gpt-4o-mini'}
          value={modelName}
          onChange={e => setModelName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') useIt(); }}
        />
        <button
          onClick={useIt}
          disabled={saving}
          className="px-4 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded text-xs"
        >
          {saving ? '保存中…' : '使用此配置'}
        </button>
      </div>

      {err && <div className="text-xs text-rose-400">⚠ {err}</div>}
    </div>
  );
}
