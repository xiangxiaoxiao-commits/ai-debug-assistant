'use client';
import { useState } from 'react';
import type { BugSummary, BugStatus } from '@/domain/types';

const STATUS_META: Record<BugStatus, { label: string; color: string; bg: string; dot: string }> = {
  'open':          { label: '待分析',   color: 'text-slate-300', bg: 'bg-slate-800',    dot: 'bg-slate-400' },
  'investigating': { label: '排查中',   color: 'text-yellow-300', bg: 'bg-yellow-950/60', dot: 'bg-yellow-400' },
  'resolved':      { label: '已解决',   color: 'text-emerald-300', bg: 'bg-emerald-950/60', dot: 'bg-emerald-400' },
  'wont-fix':      { label: '搁置',     color: 'text-slate-400', bg: 'bg-slate-900',    dot: 'bg-slate-600' }
};

interface Props {
  summary: BugSummary;
  onStatusChange: (status: BugStatus, verificationNotes?: string) => void;
}

export function SummaryCard({ summary, onStatusChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const meta = STATUS_META[summary.status];

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/60 mb-3">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="text-xs text-slate-300 font-medium flex-1 truncate">
          {summary.headline || '（暂无结论）'}
        </span>
        <div className="relative">
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >改状态 ▾</button>
          {pickerOpen && (
            <div className="absolute right-0 top-6 z-10 bg-slate-900 border border-slate-700 rounded shadow-lg py-1 min-w-[100px]">
              {(Object.keys(STATUS_META) as BugStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setPickerOpen(false); onStatusChange(s); }}
                  className="block w-full text-left px-3 py-1 text-xs hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                  <span className={STATUS_META[s].color}>{STATUS_META[s].label}</span>
                  {s === summary.status && <span className="ml-auto text-slate-500">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >{collapsed ? '展开 ▾' : '折叠 ▴'}</button>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 space-y-2 text-xs">
          {summary.rootCause && (
            <div>
              <div className="text-slate-400 text-[10px] uppercase mb-0.5">根因</div>
              <div className="text-slate-200">{summary.rootCause}</div>
            </div>
          )}
          {summary.fixApproach && (
            <div>
              <div className="text-slate-400 text-[10px] uppercase mb-0.5">修复方案</div>
              <div className="text-slate-200">{summary.fixApproach}</div>
            </div>
          )}
          {(summary.verified || summary.verificationNotes) && (
            <div>
              <div className="text-slate-400 text-[10px] uppercase mb-0.5">
                验证 {summary.verified ? '✓' : '未验证'}
              </div>
              {summary.verificationNotes && (
                <div className="text-slate-200">{summary.verificationNotes}</div>
              )}
            </div>
          )}
          {!summary.rootCause && !summary.fixApproach && (
            <div className="text-slate-500 italic">还没有更多信息，继续对话让 AI 帮你分析</div>
          )}
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
            更新于 {new Date(summary.updatedAt).toLocaleString()} · 来源 {summary.updatedBy === 'llm' ? 'AI 自动' : '手动'}
          </div>
        </div>
      )}
    </div>
  );
}
