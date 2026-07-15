'use client';
import { useEffect, useState } from 'react';
import type { ModelCandidate } from '@/domain/model-config';
import { api } from '@/client/api';
import { ModelConfigForm } from '@/components/case/model-config-form';
import type { ModelConfig } from '@/domain/model-config';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface SavedView {
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
}

export function SettingsModal({ open, onClose, onSaved }: Props) {
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [saved, setSaved] = useState<SavedView | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    setMode('view');
    setModelName('');
    api.discoverConfig()
      .then(r => { setCandidates(r.candidates); setSaved(r.saved); })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const useCandidate = async (id: string, modelOverride?: string) => {
    setSaving(true);
    setErr(null);
    try {
      const full = await api.revealCandidate(id);
      const model = modelOverride || full.model || modelName.trim();
      if (!model) {
        setErr('请先在下方输入模型名称');
        return;
      }
      await api.saveModelConfig({
        provider: full.provider,
        baseUrl: full.baseUrl,
        apiKey: full.apiKey,
        model
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-20 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-base font-semibold">模型配置</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">×</button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <div className="text-sm text-slate-400">检测中…</div>}
          {err && <div className="text-sm text-rose-400">⚠ {err}</div>}

          {!loading && saved && mode === 'view' && (
            <div className="border border-emerald-800 bg-emerald-950/30 rounded p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span className="text-sm font-medium">已保存配置</span>
                <div className="flex-1" />
                <button
                  onClick={() => setMode('edit')}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >修改</button>
              </div>
              <div className="text-xs text-slate-300 space-y-1 font-mono">
                <div>服务类型：{saved.provider}</div>
                <div>服务地址：{saved.baseUrl}</div>
                <div>模型：{saved.model}</div>
                <div>Key：{saved.apiKeyMasked}</div>
              </div>
            </div>
          )}

          {!loading && candidates.length > 0 && mode === 'view' && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">检测到的本地配置</div>
              {candidates.map(c => (
                <div key={c.id} className="border border-slate-700 rounded p-3 space-y-2">
                  <div className="text-xs text-slate-300">{c.sourceLabel}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {c.provider} · {c.baseUrl} · Key {c.apiKeyMasked}
                    {c.model ? ` · 模型 ${c.model}` : ''}
                  </div>
                  <div className="flex gap-2">
                    {!c.model && (
                      <input
                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                        placeholder="模型名称，例如 claude-sonnet-4-5"
                        value={modelName}
                        onChange={e => setModelName(e.target.value)}
                      />
                    )}
                    <button
                      disabled={saving}
                      onClick={() => useCandidate(c.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded text-xs"
                    >
                      {saving ? '保存中…' : '使用此配置'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(mode === 'edit' || (!loading && !saved && candidates.length === 0)) && (
            <ManualSection
              seed={saved ? { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, apiKey: '' } : undefined}
              onSaved={() => { onSaved(); onClose(); }}
              onBack={mode === 'edit' ? () => setMode('view') : undefined}
            />
          )}

          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
            配置保存在本机 <code className="bg-slate-800 px-1 rounded">~/.ai-debug-assistant/config.json</code>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualSection({ seed, onSaved, onBack }: {
  seed?: ModelConfig;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const [cfg, setCfg] = useState<ModelConfig>(seed ?? { provider: 'anthropic-compatible', baseUrl: '', apiKey: '', model: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model || !cfg.provider) {
      setErr('请填齐所有字段');
      return;
    }
    setSaving(true);
    try {
      await api.saveModelConfig(cfg);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">手动填写</div>
      <ModelConfigForm
        value={cfg}
        onChange={patch => setCfg(c => ({ ...c, ...patch }))}
        onSave={save}
        saving={saving}
        error={err}
      />
      {onBack && (
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200 underline">
          ← 返回自动检测
        </button>
      )}
    </div>
  );
}
