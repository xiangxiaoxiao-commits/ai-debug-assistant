'use client';
import { useState, KeyboardEvent } from 'react';
import { FolderPicker } from '@/components/analyze/folder-picker';

interface Props {
  disabled: boolean;
  submitting: boolean;
  repoPath?: string;
  onRepoPathChange: (p: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export function Composer({ disabled, submitting, repoPath, onRepoPathChange, onSubmit, placeholder }: Props) {
  const [text, setText] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const submit = () => {
    if (!text.trim() || disabled || submitting) return;
    onSubmit(text.trim());
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-slate-800 pt-3 mt-3 space-y-2">
      {showRepo && (
        <div className="flex gap-1 items-center">
          <label className="text-[10px] text-slate-400 whitespace-nowrap">代码路径</label>
          <input
            type="text"
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono"
            placeholder="/Users/you/work/backend"
            value={repoPath ?? ''}
            onChange={e => onRepoPathChange(e.target.value)}
            disabled={disabled || submitting}
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled || submitting}
            className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
          >📁</button>
          <button
            type="button"
            onClick={() => setShowRepo(false)}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >×</button>
        </div>
      )}

      <textarea
        rows={3}
        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-blue-600"
        placeholder={placeholder ?? '追问 / 补充证据（日志、cURL、SQL 都行）…按 ⌘/Ctrl+Enter 发送'}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled || submitting}
      />

      <div className="flex items-center gap-2">
        {!showRepo && (
          <button
            type="button"
            onClick={() => setShowRepo(true)}
            disabled={disabled || submitting}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            {repoPath ? `📁 ${truncate(repoPath, 32)}` : '📁 添加代码路径'}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={submit}
          disabled={disabled || submitting || !text.trim()}
          className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm font-medium"
        >
          {submitting ? '分析中…' : '发送'}
        </button>
      </div>

      <FolderPicker
        open={pickerOpen}
        initialPath={repoPath}
        onClose={() => setPickerOpen(false)}
        onPick={p => onRepoPathChange(p)}
      />
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return '…' + s.slice(-n + 1);
}
