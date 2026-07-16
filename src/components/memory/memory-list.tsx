'use client';
import { useState } from 'react';
import type { MemoryEntry, MemoryKind } from '@/domain/memory';
import { api } from '@/client/api';

const KIND_LABEL: Record<MemoryKind, string> = {
  core:       '核心',
  semantic:   '事实',
  procedural: '流程',
  resource:   '资源',
  episodic:   '事件',
};

const KIND_COLOR: Record<MemoryKind, string> = {
  core:       'text-blue-300 border-blue-900/60',
  semantic:   'text-emerald-300 border-emerald-900/60',
  procedural: 'text-yellow-300 border-yellow-900/60',
  resource:   'text-purple-300 border-purple-900/60',
  episodic:   'text-slate-300 border-slate-700',
};

interface Props {
  projectId: string;
  memories: MemoryEntry[];
  onUpdate: (m: MemoryEntry) => void;
  onDelete: (id: string) => void;
}

function MemoryRow({ projectId, memory, onUpdate, onDelete }: {
  projectId: string;
  memory: MemoryEntry;
  onUpdate: (m: MemoryEntry) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [tagsText, setTagsText] = useState(memory.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api.updateMemory(projectId, memory.id, {
        content: content.trim() || memory.content,
        tags: tagsText ? tagsText.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      onUpdate(r.memory);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.forgetMemory(projectId, memory.id);
      onDelete();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="group border border-slate-800 rounded bg-slate-900/40 px-2.5 py-2 space-y-1">
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 resize-none"
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400"
            value={tagsText}
            onChange={e => setTagsText(e.target.value)}
            placeholder="标签（逗号分隔）"
          />
          {error && <div className="text-[11px] text-rose-400">⚠ {error}</div>}
          <div className="flex gap-1.5">
            <button onClick={save} disabled={saving} className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40">
              {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200">取消</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <div className="flex-1 text-xs text-slate-200 leading-relaxed">{memory.content}</div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => setEditing(true)} className="text-[10px] text-slate-400 hover:text-slate-200">编辑</button>
              <button onClick={handleDelete} disabled={saving} className="text-[10px] text-rose-400 hover:text-rose-300 disabled:opacity-40">删除</button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-500">强度 {memory.strength}</span>
            {memory.tags.map(t => (
              <span key={t} className="text-[10px] px-1 py-0.5 rounded border border-slate-700 text-slate-400">{t}</span>
            ))}
            {memory.sources?.map((s, i) => (
              <span key={i} className="text-[10px] text-slate-600 truncate max-w-[120px]">{s}</span>
            ))}
          </div>
          {error && <div className="text-[11px] text-rose-400">⚠ {error}</div>}
        </>
      )}
    </div>
  );
}

export function MemoryList({ projectId, memories, onUpdate, onDelete }: Props) {
  const ALL_KINDS: MemoryKind[] = ['core', 'semantic', 'procedural', 'resource', 'episodic'];

  const grouped = ALL_KINDS.reduce((acc, kind) => {
    acc[kind] = memories.filter(m => m.kind === kind);
    return acc;
  }, {} as Record<MemoryKind, MemoryEntry[]>);

  if (memories.length === 0) {
    return <div className="text-xs text-slate-500 italic py-2">暂无记忆条目</div>;
  }

  return (
    <div className="space-y-3">
      {ALL_KINDS.filter(k => grouped[k].length > 0).map(kind => (
        <div key={kind}>
          <div className={`text-[10px] uppercase tracking-wide border-b pb-1 mb-1.5 ${KIND_COLOR[kind]}`}>
            {KIND_LABEL[kind]} · {grouped[kind].length}
          </div>
          <div className="space-y-1.5">
            {grouped[kind].map(m => (
              <MemoryRow
                key={m.id}
                projectId={projectId}
                memory={m}
                onUpdate={onUpdate}
                onDelete={() => onDelete(m.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
