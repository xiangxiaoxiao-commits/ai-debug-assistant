'use client';
import { useState } from 'react';
import type { PipelineState } from '@/domain/types';
import { StepBadge } from './step-badge';

export function PipelineBar({ pipeline }: { pipeline: PipelineState }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = pipeline.steps[activeIdx];

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">Pipeline</div>
      <div className="grid grid-cols-4 gap-2">
        {pipeline.steps.map((s, i) => (
          <StepBadge key={s.step} step={s} active={i === activeIdx} onClick={() => setActiveIdx(i)} />
        ))}
      </div>
      <div className="border border-slate-800 rounded p-2 text-xs space-y-1 bg-slate-950/60">
        <div className="text-slate-300 font-medium">{active.step}</div>
        <div className="text-slate-500">
          Status: <span className="text-slate-300">{active.status}</span>
        </div>
        {active.blockedReason && (
          <div className="text-orange-300">
            Blocked ({active.blockedReason.kind}): {active.blockedReason.detail}
          </div>
        )}
        {active.error && (
          <div className="text-rose-300">Error {active.error.code}: {active.error.message}</div>
        )}
        {active.status === 'waiting' && (
          <div className="text-slate-500">Phase 1：Pipeline 尚未启动。Phase 2 接入 LLM 后此处才会有内容。</div>
        )}
      </div>
    </div>
  );
}
