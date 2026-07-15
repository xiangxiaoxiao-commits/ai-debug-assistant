'use client';
import { useState } from 'react';
import { FolderPicker } from './folder-picker';

export interface QuickFormValue {
  problem: string;
  repoPath: string;
  entry?: string;
  environment?: string;
  module?: string;
}

interface Props {
  disabled: boolean;
  submitting: boolean;
  onSubmit: (v: QuickFormValue) => void;
}

export function QuickForm({ disabled, submitting, onSubmit }: Props) {
  const [problem, setProblem] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [entry, setEntry] = useState('');
  const [environment, setEnvironment] = useState('');
  const [module, setModule] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!problem.trim()) {
      setError('请先描述你遇到的问题');
      return;
    }
    onSubmit({
      problem: problem.trim(),
      repoPath: repoPath.trim(),
      entry: entry.trim() || undefined,
      environment: environment.trim() || undefined,
      module: module.trim() || undefined
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          描述你的问题<span className="text-rose-400">*</span>
        </label>
        <textarea
          rows={10}
          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-blue-600"
          placeholder={`把现象、期望、复现步骤都写在这里，也可以直接粘贴：\n- 日志片段\n- Copy as cURL 结果\n- CREATE TABLE / init.sql\n- 工单描述\n\n例：审批详情页显示的是数字 1、2、3，希望显示"已通过""驳回"这种中文名。工单 PLJI-2458，用户 yunying，Chrome。`}
          value={problem}
          onChange={e => setProblem(e.target.value)}
          disabled={disabled || submitting}
        />
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">代码仓库路径（可选，填了会让 AI 读代码）</label>
          <div className="flex gap-1">
            <input
              type="text"
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-600 font-mono"
              placeholder="/Users/you/work/backend"
              value={repoPath}
              onChange={e => setRepoPath(e.target.value)}
              disabled={disabled || submitting}
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={disabled || submitting}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sm whitespace-nowrap"
              title="打开目录选择器"
            >
              📁 选择…
            </button>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={disabled || submitting}
          className="px-6 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm font-medium transition"
        >
          {submitting ? '分析中…' : '开始分析'}
        </button>
      </div>

      <FolderPicker
        open={pickerOpen}
        initialPath={repoPath || undefined}
        onClose={() => setPickerOpen(false)}
        onPick={p => setRepoPath(p)}
      />

      <button
        type="button"
        onClick={() => setAdvanced(v => !v)}
        className="text-[11px] text-slate-500 hover:text-slate-300"
      >
        {advanced ? '▲ 收起' : '▼ 更多字段（工单号 / 环境 / 模块）'}
      </button>

      {advanced && (
        <div className="grid grid-cols-3 gap-2">
          <input
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
            placeholder="工单号或 URL"
            value={entry}
            onChange={e => setEntry(e.target.value)}
            disabled={disabled || submitting}
          />
          <input
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
            placeholder="环境（如 生产 / staging）"
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            disabled={disabled || submitting}
          />
          <input
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
            placeholder="模块（可选）"
            value={module}
            onChange={e => setModule(e.target.value)}
            disabled={disabled || submitting}
          />
        </div>
      )}

      {error && <div className="text-xs text-rose-400">⚠ {error}</div>}

      {disabled && (
        <div className="text-xs text-amber-400">请先在右上角 ⚙ 完成模型配置</div>
      )}
    </div>
  );
}
