'use client';
import { useState } from 'react';
import { EVIDENCE_TYPES } from '@/domain/constants';
import type { EvidenceType } from '@/domain/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (type: EvidenceType, content: string) => Promise<void>;
}

export function EvidenceAddDialog({ open, onClose, onSubmit }: Props) {
  const [type, setType] = useState<EvidenceType>('curl');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!content.trim()) { setError('内容不能为空'); return; }
    setSubmitting(true);
    try {
      await onSubmit(type, content);
      setContent('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-10 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded p-4 w-[560px] space-y-2">
        <div className="text-sm font-semibold">添加证据</div>
        <select
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={type} onChange={e => setType(e.target.value as EvidenceType)}>
          {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <textarea
          rows={12}
          className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono"
          placeholder={type === 'curl' ? 'curl -X GET ...' : '粘贴内容'}
          value={content} onChange={e => setContent(e.target.value)} />
        {error && <div className="text-xs text-rose-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600" onClick={onClose}>取消</button>
          <button disabled={submitting}
            className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            onClick={submit}>{submitting ? '添加中...' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
