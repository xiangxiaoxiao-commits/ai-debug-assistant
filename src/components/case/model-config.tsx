'use client';
import { useEffect, useState } from 'react';
import { api } from '@/client/api';
import type { ModelCandidate, ModelConfig } from '@/domain/model-config';
import { ModelConfigForm } from './model-config-form';
import { ModelConfigPicker } from './model-config-picker';

type Mode = 'loading' | 'saved' | 'candidates' | 'manual';

const EMPTY: ModelConfig = { provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' };

export function ModelConfig({ onChange }: { onChange: (configured: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [saved, setSaved] = useState<{ provider: string; baseUrl: string; model: string; apiKeyMasked: string } | null>(null);
  const [form, setForm] = useState<ModelConfig>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // prompt for model name when candidate has none
  const [pendingCandidate, setPendingCandidate] = useState<ModelConfig | null>(null);

  useEffect(() => {
    api.discoverConfig()
      .then(({ candidates: cs, saved: sv }) => {
        setCandidates(cs);
        setSaved(sv);
        if (sv) {
          setMode('saved');
          onChange(true);
        } else if (cs.length > 0) {
          setMode('candidates');
        } else {
          setMode('manual');
        }
      })
      .catch(() => setMode('manual'));
  }, [onChange]);

  const applyConfig = async (cfg: ModelConfig) => {
    setSaving(true);
    setError(null);
    try {
      await api.saveModelConfig(cfg);
      setForm(cfg);
      setSaved({ provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, apiKeyMasked: cfg.apiKey.slice(0, 8) + '****' });
      setMode('saved');
      onChange(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePickCandidate = async (candidate: ModelCandidate) => {
    setError(null);
    try {
      const full = await api.revealCandidate(candidate.id);
      if (!full.model) {
        // Need model name — show form pre-filled
        setPendingCandidate(full);
        setForm({ ...full, model: '' });
        setMode('manual');
      } else {
        await applyConfig(full);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleReloadSaved = async () => {
    if (!saved) return;
    setError(null);
    // find matching candidate by source=saved
    const sv = candidates.find(c => c.source === 'saved');
    if (sv) {
      await handlePickCandidate(sv);
    } else {
      // fall through to discover again
      const discovered = await api.discoverConfig().catch(() => null);
      const svCandidate = discovered?.candidates.find(c => c.source === 'saved');
      if (svCandidate) await handlePickCandidate(svCandidate);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">模型配置</div>
      <div className="text-[10px] text-slate-500 bg-slate-800/60 rounded px-2 py-1">
        ⚙ 配置将保存到 <code className="text-slate-400">~/.ai-debug-assistant/config.json</code>（本地文件，你可以随时手动编辑或删除）
      </div>

      {mode === 'loading' && (
        <div className="text-xs text-slate-500">正在检测配置…</div>
      )}

      {mode === 'saved' && saved && (
        <div className="bg-emerald-900/30 border border-emerald-700/40 rounded p-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-300 font-medium">✓ 已保存配置</span>
          </div>
          <div className="text-[10px] text-slate-400">
            <span className="text-slate-300">{saved.provider}</span> · {saved.baseUrl}
          </div>
          <div className="text-[10px] text-slate-500">模型：{saved.model}</div>
          <div className="text-[10px] font-mono text-slate-600">{saved.apiKeyMasked}</div>
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={handleReloadSaved}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-700/50 hover:bg-emerald-700 text-emerald-300"
            >
              重新载入完整 Key
            </button>
            <button
              onClick={() => { setForm({ provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, apiKey: '' }); setMode('manual'); }}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600"
            >
              修改
            </button>
          </div>
          {error && <div className="text-xs text-rose-400">⚠ {error}</div>}
        </div>
      )}

      {mode === 'candidates' && candidates.length > 0 && (
        <div className="space-y-2">
          <ModelConfigPicker candidates={candidates} onPick={handlePickCandidate} />
          <button
            onClick={() => setMode('manual')}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >
            手动填写
          </button>
          {error && <div className="text-xs text-rose-400">⚠ {error}</div>}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-2">
          {pendingCandidate && (
            <div className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-2 py-1">
              已自动填入服务地址和 Key，请补充模型名称后保存。
            </div>
          )}
          <ModelConfigForm
            value={form}
            onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            onSave={() => applyConfig(form)}
            saving={saving}
            error={error}
          />
          {candidates.length > 0 && (
            <button
              onClick={() => { setPendingCandidate(null); setMode('candidates'); }}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline"
            >
              返回自动检测
            </button>
          )}
        </div>
      )}
    </div>
  );
}
