'use client';
import { useState } from 'react';
import type { Trace, TraceStep } from '@/domain/types';

interface Props {
  trace: Trace | null;
}

const KIND_LABEL: Record<TraceStep['kind'], string> = {
  'classify-feature':  '特征分类',
  'find-similar':      '相似案例',
  'load-knowledge':    '加载知识',
  'quick-ingest':      '证据摄取',
  'read-code':         '读取代码',
  'build-prompt':      '构建提示',
  'llm-call':          'LLM 推理',
  'extract-summary':   '提取摘要',
  'extract-lesson':    '提取教训',
  'refresh-knowledge': '刷新知识',
  'update-playbook':   '更新 Playbook',
};

function StatusIcon({ status }: { status: TraceStep['status'] }) {
  if (status === 'ok')      return <span className="text-emerald-400 text-[11px]">✓</span>;
  if (status === 'skipped') return <span className="text-slate-500 text-[11px]">○</span>;
  return <span className="text-rose-400 text-[11px]">✗</span>;
}

function DurationBar({ step, maxMs }: { step: TraceStep; maxMs: number }) {
  if (step.status === 'skipped' || maxMs === 0) {
    return <div className="w-16 h-1.5 rounded-sm bg-slate-800" />;
  }
  const pct = Math.max(2, Math.round((step.durationMs / maxMs) * 100));
  const color = step.status === 'ok' ? 'bg-emerald-600/60' : 'bg-rose-600/60';
  return (
    <div className="w-16 h-1.5 rounded-sm bg-slate-800 overflow-hidden flex-shrink-0">
      <div className={`h-full rounded-sm ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StepRow({ step, maxMs }: { step: TraceStep; maxMs: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail = step.status === 'failed' && step.error;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-0.5 text-xs ${hasDetail ? 'cursor-pointer hover:bg-slate-800/40 rounded px-1 -mx-1' : 'px-1 -mx-1'}`}
        onClick={() => hasDetail && setOpen(v => !v)}
      >
        <StatusIcon status={step.status} />
        <span className={`w-28 flex-shrink-0 ${step.status === 'skipped' ? 'text-slate-500' : 'text-slate-300'}`}>
          {KIND_LABEL[step.kind] ?? step.kind}
        </span>
        <span className={`flex-1 truncate ${step.status === 'skipped' ? 'text-slate-600' : 'text-slate-400'}`}>
          {step.label}
        </span>
        <DurationBar step={step} maxMs={maxMs} />
        <span className="text-slate-500 text-[10px] flex-shrink-0 w-10 text-right">
          {step.status !== 'skipped' ? `${step.durationMs}ms` : '—'}
        </span>
        {hasDetail && (
          <span className="text-slate-500 text-[10px]">{open ? '▴' : '▾'}</span>
        )}
      </div>
      {open && hasDetail && (
        <div className="ml-6 mt-0.5 mb-1 text-[11px] text-rose-300 bg-rose-950/30 rounded px-2 py-1 border border-rose-900/40">
          {step.error}
        </div>
      )}
    </div>
  );
}

export function TraceTimeline({ trace }: Props) {
  const [open, setOpen] = useState(false);

  if (trace === undefined) return null;

  const okCount = trace?.steps.filter(s => s.status === 'ok').length ?? 0;
  const totalCount = trace?.steps.length ?? 0;
  const totalMs = trace?.totalMs ?? 0;
  const maxStepMs = trace
    ? Math.max(...trace.steps.filter(s => s.status !== 'skipped').map(s => s.durationMs), 1)
    : 1;

  return (
    <details
      className="mt-1.5"
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none text-[11px] text-slate-500 hover:text-slate-300 list-none flex items-center gap-1.5 py-0.5">
        <span className="text-[9px]">{open ? '▼' : '▶'}</span>
        查看执行链路
        {trace && (
          <span className="text-slate-600">· {okCount}/{totalCount} 步 · {(totalMs / 1000).toFixed(2)}s</span>
        )}
        {!trace && (
          <span className="text-slate-700">（trace 数据未载入）</span>
        )}
      </summary>

      <div className="mt-1.5 rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
        {!trace && (
          <div className="text-xs text-slate-500">trace 数据未载入</div>
        )}
        {trace && (
          <>
            <div className="text-[10px] text-slate-500 mb-2">
              共 {totalCount} 步 · 总耗时 {(totalMs / 1000).toFixed(2)}s
            </div>
            <div className="space-y-0">
              {trace.steps.map(step => (
                <StepRow key={step.id} step={step} maxMs={maxStepMs} />
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
