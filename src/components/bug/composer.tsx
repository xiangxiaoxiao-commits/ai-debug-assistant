'use client';
import { useState, useRef, KeyboardEvent, ClipboardEvent, DragEvent } from 'react';
import { FolderPicker } from '@/components/analyze/folder-picker';

interface Props {
  disabled: boolean;
  submitting: boolean;
  repoPath?: string;
  onRepoPathChange: (p: string) => void;
  onSubmit: (text: string, images: File[]) => void;
  placeholder?: string;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function Composer({ disabled, submitting, repoPath, onRepoPathChange, onSubmit, placeholder }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [showRepo, setShowRepo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addImages = (files: File[]) => {
    const accepted = files.filter(f => ACCEPTED.includes(f.type) && f.size <= 8 * 1024 * 1024);
    if (accepted.length === 0) return;
    setImages(prev => [...prev, ...accepted].slice(0, 6));   // cap 6 per send
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const submit = () => {
    if ((!text.trim() && images.length === 0) || disabled || submitting) return;
    onSubmit(text.trim(), images);
    setText('');
    setImages([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && ACCEPTED.includes(f.type)) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED.includes(f.type));
    if (files.length > 0) addImages(files);
  };

  return (
    <div
      className={`border-t pt-3 mt-3 space-y-2 ${dragOver ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800'}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
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

      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((f, i) => {
            const url = URL.createObjectURL(f);
            return (
              <div key={i} className="relative group">
                <img
                  src={url}
                  alt={f.name}
                  className="w-20 h-20 object-cover rounded border border-slate-700"
                  onLoad={() => URL.revokeObjectURL(url)}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs opacity-0 group-hover:opacity-100"
                >×</button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white px-1 truncate">
                  {(f.size / 1024).toFixed(0)}KB
                </div>
              </div>
            );
          })}
        </div>
      )}

      <textarea
        rows={3}
        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-blue-600"
        placeholder={placeholder ?? '追问 / 补充证据（日志、cURL、SQL 都行；粘贴/拖拽图片直接贴截图）…按 ⌘/Ctrl+Enter 发送'}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        disabled={disabled || submitting}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || submitting}
          className="text-[11px] text-slate-400 hover:text-slate-200"
          title="添加图片"
        >
          🖼️ 图片
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={e => { const files = Array.from(e.target.files ?? []); addImages(files); e.target.value = ''; }}
        />
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
          disabled={disabled || submitting || (!text.trim() && images.length === 0)}
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
