'use client';
import type { PipelineStep, StepStatus } from '@/domain/types';
import { cn } from '@/lib/cn';

const STATUS_STYLE: Record<StepStatus, string> = {
  waiting: 'bg-slate-800 text-slate-400 border-slate-700',
  ready: 'bg-blue-900/60 text-blue-200 border-blue-700',
  running: 'bg-yellow-900/60 text-yellow-200 border-yellow-700 animate-pulse',
  blocked: 'bg-orange-900/60 text-orange-200 border-orange-700',
  done: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  skipped: 'bg-slate-800/60 text-slate-500 border-slate-800'
};

interface Props {
  step: PipelineStep;
  active: boolean;
  onClick: () => void;
}

export function StepBadge({ step, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start rounded border px-2 py-1.5 text-left transition',
        STATUS_STYLE[step.status],
        active ? 'ring-2 ring-blue-400' : 'hover:brightness-110'
      )}>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{step.status}</span>
      <span className="text-xs font-medium">{step.step}</span>
    </button>
  );
}
