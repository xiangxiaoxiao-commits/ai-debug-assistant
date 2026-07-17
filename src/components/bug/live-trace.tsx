'use client';

export interface LiveStep {
  kind: string;
  label: string;
  status: string;
  durationMs?: number;
}

interface Props {
  steps: LiveStep[];
  finished: boolean;
}

/** Live tick-list of trace steps shown while an assistant reply is streaming.
 *  Keeps the user informed that work is happening (LLM calls can take 30-60s
 *  and the answer text streams late — this fills the gap with visible progress). */
export function LiveTrace({ steps, finished }: Props) {
  if (steps.length === 0 && !finished) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        <span>准备中…</span>
      </div>
    );
  }

  return (
    <ul className="space-y-1 text-xs">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const runningIndicator = !finished && isLast && s.status === 'ok';
        // Note: emitStep after step() completes always yields 'ok' or 'failed'.
        // A truly "in progress" step exists between add() and emitStep(), but
        // is invisible to the client until it finishes. So we highlight the
        // last completed step during streaming as "just done, next incoming".

        let icon = '·';
        let color = 'text-slate-400';
        if (s.status === 'ok') { icon = '✓'; color = 'text-emerald-400'; }
        else if (s.status === 'skipped') { icon = '○'; color = 'text-slate-500'; }
        else if (s.status === 'failed') { icon = '✗'; color = 'text-rose-400'; }

        return (
          <li key={i} className="flex items-center gap-2">
            <span className={`w-4 text-center ${color}`}>{icon}</span>
            <span className="text-slate-300 flex-1">{s.label}</span>
            {typeof s.durationMs === 'number' && (
              <span className="text-slate-500 tabular-nums">{s.durationMs}ms</span>
            )}
            {runningIndicator && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            )}
          </li>
        );
      })}
      {!finished && (
        <li className="flex items-center gap-2 pt-1">
          <span className="w-4 text-center text-yellow-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          </span>
          <span className="text-slate-400 italic">继续处理中…</span>
        </li>
      )}
    </ul>
  );
}
