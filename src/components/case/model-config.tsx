'use client';
import { useEffect, useState } from 'react';

const KEY = 'ada:model-config';

interface Config {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function ModelConfig({ onChange }: { onChange: (configured: boolean) => void }) {
  const [cfg, setCfg] = useState<Config>({ provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' });

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Config;
        setCfg(parsed);
        onChange(Boolean(parsed.baseUrl && parsed.apiKey && parsed.model));
      } catch { /* ignore */ }
    }
  }, [onChange]);

  const update = (patch: Partial<Config>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    sessionStorage.setItem(KEY, JSON.stringify(next));
    onChange(Boolean(next.baseUrl && next.apiKey && next.model));
  };

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">模型配置</div>
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        placeholder="Base URL (e.g. https://api.example.com/v1)"
        value={cfg.baseUrl}
        onChange={e => update({ baseUrl: e.target.value })}
      />
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        type="password"
        placeholder="API Key (仅本会话保留)"
        value={cfg.apiKey}
        onChange={e => update({ apiKey: e.target.value })}
      />
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        placeholder="Model name"
        value={cfg.model}
        onChange={e => update({ model: e.target.value })}
      />
      <p className="text-[10px] text-slate-500">Key 仅存于本会话 sessionStorage，Phase 2 才连通模型。</p>
    </div>
  );
}
