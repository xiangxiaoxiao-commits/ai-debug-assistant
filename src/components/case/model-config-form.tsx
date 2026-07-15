'use client';
import type { ModelConfig } from '@/domain/model-config';

interface Props {
  value: ModelConfig;
  onChange: (patch: Partial<ModelConfig>) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}

export function ModelConfigForm({ value, onChange, onSave, saving, error }: Props) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">服务地址 (Base URL)</span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="https://api.deepseek.com/v1"
          value={value.baseUrl}
          onChange={e => onChange({ baseUrl: e.target.value })}
        />
        <p className="text-[10px] text-slate-500">
          OpenAI 兼容接口的地址。如果连的是 Anthropic 原生 API，一般是 https://api.anthropic.com
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">API Key</span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono"
          type="password"
          placeholder="sk-xxxxxxxx"
          value={value.apiKey}
          onChange={e => onChange({ apiKey: e.target.value })}
        />
        <p className="text-[10px] text-slate-500">
          模型服务商发的密钥。仅保存在本机 ~/.ai-debug-assistant/config.json，不会外发
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">模型名称</span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="deepseek-chat / gpt-4o-mini / claude-sonnet-4-5"
          value={value.model}
          onChange={e => onChange({ model: e.target.value })}
        />
        <p className="text-[10px] text-slate-500">
          具体调用哪个模型，需要与服务地址支持的模型一致
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">服务类型</span>
        <select
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={value.provider}
          onChange={e => onChange({ provider: e.target.value })}
        >
          <option value="openai-compatible">OpenAI 兼容</option>
          <option value="anthropic-compatible">Anthropic 兼容</option>
        </select>
        <p className="text-[10px] text-slate-500">
          多数国内模型和 OpenAI-like 服务选 OpenAI 兼容；Claude 官方或 Claude Code 中转选 Anthropic 兼容
        </p>
      </label>

      {error && <div className="text-xs text-rose-400">⚠ {error}</div>}
      <button
        disabled={saving}
        onClick={onSave}
        className="w-full text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-1.5"
      >
        {saving ? '保存中…' : '保存配置'}
      </button>
    </div>
  );
}
