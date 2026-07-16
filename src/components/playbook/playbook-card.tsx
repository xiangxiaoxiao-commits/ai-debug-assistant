'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Playbook, PlaybookStep } from '@/domain/types';
import { api } from '@/client/api';

interface Props {
  caseId: string;
}

const STATUS_META: Record<PlaybookStep['status'], { label: string; color: string; dot: string }> = {
  todo:    { label: '待做',  color: 'text-slate-400',   dot: 'bg-slate-500' },
  doing:   { label: '进行中', color: 'text-yellow-300',  dot: 'bg-yellow-400' },
  done:    { label: '已完成', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  skipped: { label: '跳过',  color: 'text-slate-500',   dot: 'bg-slate-600' },
};

type StepPatch = { status?: PlaybookStep['status']; notes?: string; title?: string; hint?: string };

interface StepItemProps {
  step: PlaybookStep;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: StepPatch) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function StepItem({ step, reordering, isFirst, isLast, onPatch, onDelete, onMoveUp, onMoveDown }: StepItemProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(step.title);
  const [hint, setHint] = useState(step.hint ?? '');
  const [notes, setNotes] = useState(step.notes ?? '');
  const [statusOpen, setStatusOpen] = useState(false);
  const meta = STATUS_META[step.status];

  const saveEdit = () => {
    onPatch({ title: title.trim() || step.title, hint: hint || undefined, notes: notes || undefined });
    setEditing(false);
  };

  return (
    <div className="group border border-slate-800 rounded bg-slate-900/40 px-2.5 py-2">
      <div className="flex items-start gap-2">
        {reordering && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-30 leading-none"
            >▲</button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-30 leading-none"
            >▼</button>
          </div>
        )}

        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1.5">
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="步骤标题"
              />
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400"
                value={hint}
                onChange={e => setHint(e.target.value)}
                placeholder="提示（可选）"
              />
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 resize-none"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="备注（可选）"
              />
              <div className="flex gap-1.5">
                <button onClick={saveEdit} className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500">保存</button>
                <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200">取消</button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-slate-200">{step.title}</div>
              {step.hint && <div className="text-[11px] text-slate-500 mt-0.5">{step.hint}</div>}
              {step.notes && <div className="text-[11px] text-slate-400 mt-0.5 italic">{step.notes}</div>}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="relative">
              <button
                onClick={() => setStatusOpen(v => !v)}
                className={`text-[10px] px-1.5 py-0.5 rounded border border-slate-700 ${meta.color}`}
              >{meta.label} ▾</button>
              {statusOpen && (
                <div className="absolute right-0 top-6 z-10 bg-slate-900 border border-slate-700 rounded shadow-lg py-1 min-w-[80px]">
                  {(Object.keys(STATUS_META) as PlaybookStep['status'][]).map(s => (
                    <button
                      key={s}
                      onClick={() => { setStatusOpen(false); onPatch({ status: s }); }}
                      className={`block w-full text-left px-2 py-1 text-[11px] hover:bg-slate-800 ${STATUS_META[s].color}`}
                    >
                      {STATUS_META[s].label}
                      {s === step.status && <span className="ml-1 text-slate-500">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setEditing(true)} className="text-[10px] text-slate-400 hover:text-slate-200">编辑</button>
            <button onClick={onDelete} className="text-[10px] text-rose-400 hover:text-rose-300">删除</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PlaybookCard({ caseId }: Props) {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newHint, setNewHint] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getPlaybook(caseId);
      setPlaybook(r.playbook);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const handlePatch = async (stepId: string, patch: StepPatch) => {
    setSaving(true);
    try {
      const r = await api.patchPlaybookStep(caseId, stepId, patch);
      setPlaybook(r.playbook);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stepId: string) => {
    if (!playbook) return;
    const steps = playbook.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order: i }));
    setSaving(true);
    try {
      const r = await api.updatePlaybook(caseId, steps);
      setPlaybook(r.playbook);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (idx: number, dir: -1 | 1) => {
    if (!playbook) return;
    const steps = [...playbook.steps];
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    const reordered = steps.map((s, i) => ({ ...s, order: i }));
    setSaving(true);
    try {
      const r = await api.updatePlaybook(caseId, reordered);
      setPlaybook(r.playbook);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const existing = playbook?.steps ?? [];
    const newStep: PlaybookStep = {
      id: crypto.randomUUID(),
      order: existing.length,
      title: newTitle.trim(),
      hint: newHint.trim() || undefined,
      status: 'todo',
      updatedAt: new Date().toISOString(),
      updatedBy: 'user',
    };
    setSaving(true);
    try {
      const r = await api.updatePlaybook(caseId, [...existing, newStep]);
      setPlaybook(r.playbook);
      setNewTitle('');
      setNewHint('');
      setAddOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEmpty = async () => {
    setSaving(true);
    try {
      const r = await api.updatePlaybook(caseId, []);
      setPlaybook(r.playbook);
      setCollapsed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel: Record<string, string> = { auto: 'AI 自动生成', user: '手动编辑', template: '模板' };
  const steps = playbook?.steps ?? [];

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/60 mb-3">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <span className="text-xs text-slate-300 font-medium flex-1">
          排障 Playbook
          {steps.length > 0 && (
            <span className="ml-1 text-slate-500">
              · {steps.filter(s => s.status === 'done').length}/{steps.length} 步
            </span>
          )}
        </span>
        {saving && <span className="text-[10px] text-slate-500 animate-pulse">保存中…</span>}
        {!collapsed && (
          <button
            onClick={() => setReordering(v => !v)}
            className={`text-[11px] px-2 py-0.5 rounded border ${reordering ? 'bg-blue-900/40 border-blue-700 text-blue-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >重排序</button>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >{collapsed ? '展开 ▾' : '折叠 ▴'}</button>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 space-y-2">
          {loading && <div className="text-xs text-slate-500">加载中…</div>}
          {error && (
            <div className="text-xs text-rose-400 flex items-center gap-1">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-slate-500 hover:text-slate-300">×</button>
            </div>
          )}

          {!loading && !error && playbook === null && (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <div className="text-xs text-slate-400">还没有 Playbook</div>
              <div className="text-[11px] text-slate-600">AI 会在分析后自动生成，也可以手动创建</div>
              <button
                onClick={handleCreateEmpty}
                disabled={saving}
                className="mt-1 text-[11px] px-3 py-1 rounded border border-slate-700 text-slate-300 hover:text-slate-100 hover:border-slate-500 disabled:opacity-40"
              >
                {saving ? '创建中…' : '+ 从空白创建'}
              </button>
            </div>
          )}

          {playbook && (
            <div className="text-[10px] text-slate-500">
              来源: {sourceLabel[playbook.source] ?? playbook.source}
              · 更新于 {new Date(playbook.updatedAt).toLocaleString()}
            </div>
          )}

          {steps.length === 0 && !loading && (
            <div className="text-xs text-slate-500 italic py-1">暂无步骤，点击"+ 添加步骤"创建</div>
          )}

          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <StepItem
                key={step.id}
                step={step}
                reordering={reordering}
                isFirst={idx === 0}
                isLast={idx === steps.length - 1}
                onPatch={patch => handlePatch(step.id, patch)}
                onDelete={() => handleDelete(step.id)}
                onMoveUp={() => handleMove(idx, -1)}
                onMoveDown={() => handleMove(idx, 1)}
              />
            ))}
          </div>

          {addOpen ? (
            <div className="border border-slate-700 rounded bg-slate-900/60 px-2.5 py-2 space-y-1.5">
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="步骤标题 *"
                autoFocus
              />
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400"
                value={newHint}
                onChange={e => setNewHint(e.target.value)}
                placeholder="提示（可选）"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleAdd}
                  disabled={!newTitle.trim()}
                  className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
                >添加</button>
                <button onClick={() => { setAddOpen(false); setNewTitle(''); setNewHint(''); }} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200">取消</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <span className="text-slate-500">+</span> 添加步骤
            </button>
          )}
        </div>
      )}
    </div>
  );
}
