'use client';
import { useRef, useState, ClipboardEvent, DragEvent } from 'react';
import { FolderPicker } from './folder-picker';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export interface QuickFormValue {
  problem: string;
  repoPath: string;
  images: File[];
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
  const [images, setImages] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [entry, setEntry] = useState('');
  const [environment, setEnvironment] = useState('');
  const [module, setModule] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addImages = (files: File[]) => {
    const accepted = files.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type) && f.size <= 8 * 1024 * 1024);
    if (accepted.length === 0) return;
    setImages(prev => [...prev, ...accepted].slice(0, 6));
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && ACCEPTED_IMAGE_TYPES.includes(f.type)) files.push(f);
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
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (files.length > 0) addImages(files);
  };

  const submit = () => {
    setError(null);
    if (!problem.trim() && images.length === 0) {
      setError('请先描述你遇到的问题（或至少贴一张截图）');
      return;
    }
    onSubmit({
      problem: problem.trim() || '(用户上传了截图，请分析)',
      repoPath: repoPath.trim(),
      images,
      entry: entry.trim() || undefined,
      environment: environment.trim() || undefined,
      module: module.trim() || undefined
    });
  };

  return (
    <div
      className={`space-y-3 rounded ${dragOver ? 'ring-2 ring-blue-500 bg-blue-950/10' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-slate-400">
            描述你的问题<span className="text-rose-400">*</span>
            <span className="ml-2 text-[10px] text-slate-500">支持贴截图（⌘/Ctrl+V 或拖拽）</span>
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || submitting}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            🖼️ 添加图片
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); addImages(files); e.target.value = ''; }}
          />
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
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
          rows={10}
          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-blue-600"
          placeholder={`把现象、期望、复现步骤都写在这里，也可以直接粘贴：\n- 日志片段\n- Copy as cURL 结果\n- CREATE TABLE / init.sql\n- 工单描述\n- 截图（⌘/Ctrl+V 或拖入）\n\n例：审批详情页显示的是数字 1、2、3，希望显示"已通过""驳回"这种中文名。工单 PLJI-2458，用户 yunying，Chrome。`}
          value={problem}
          onChange={e => setProblem(e.target.value)}
          onPaste={onPaste}
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
              placeholder="/Users/you/work/backend (Mac) 或 C:\Users\you\work\backend (Win)"
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
