'use client';
import { useEffect, useRef } from 'react';
import type { Message, Trace } from '@/domain/types';
import { SectionedReport } from '@/components/bug/sectioned-report';
import { TraceTimeline } from '@/components/trace/trace-timeline';
import { LiveTrace, type LiveStep } from '@/components/bug/live-trace';
import { stripFlows } from '@/lib/flow-extract';

interface Props {
  messages: Message[];
  streamingText: string;
  streamingStatus: 'idle' | 'streaming' | 'done' | 'error';
  streamingError: string | null;
  liveSteps?: LiveStep[];
  caseId?: string;
  messageTraceMap?: Map<string, string>;
  traceById?: Map<string, Trace>;
}

export function Conversation({ messages, streamingText, streamingStatus, streamingError, liveSteps, caseId, messageTraceMap, traceById }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingText, streamingStatus]);

  return (
    <div className="space-y-3">
      {messages.filter(m => m.role !== 'system-summary').map(m => {
        const traceId = m.role === 'assistant' ? (messageTraceMap?.get(m.id) ?? null) : null;
        const trace = traceId ? (traceById?.get(traceId) ?? null) : null;
        return (
          <Bubble
            key={m.id}
            message={m}
            caseId={caseId}
            trace={m.role === 'assistant' && traceId ? trace : undefined}
          />
        );
      })}

      {streamingStatus === 'streaming' && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-yellow-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            AI 分析中…
          </div>
          {liveSteps && liveSteps.length > 0 && (
            <LiveTrace steps={liveSteps} finished={false} />
          )}
          {streamingText && (
            <div className="pt-2 border-t border-slate-800">
              <SectionedReport source={stripFlows(streamingText)} />
            </div>
          )}
          {!streamingText && (!liveSteps || liveSteps.length === 0) && (
            <div className="text-xs text-slate-500">（等待模型返回…）</div>
          )}
        </div>
      )}

      {streamingStatus === 'error' && streamingError && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-300">
          <div className="font-medium mb-1">分析失败</div>
          <div className="text-xs text-rose-400/80">{streamingError}</div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({ message, caseId, trace }: { message: Message; caseId?: string; trace?: Trace | null }) {
  const isUser = message.role === 'user';
  return (
    <div className={
      isUser
        ? 'rounded-lg border bg-blue-950/30 border-blue-900/60 p-3'
        : 'space-y-2'
    }>
      <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wide ${isUser ? 'mb-2' : ''}`}>
        <span className={isUser ? 'text-blue-300' : 'text-emerald-300'}>
          {isUser ? '你' : 'AI'}
        </span>
        <span className="text-slate-500">
          {new Date(message.createdAt).toLocaleString()}
        </span>
        {message.ingested?.evidenceIds?.length ? (
          <span className="text-slate-500">
            · 已解析 {message.ingested.evidenceIds.length} 条证据
          </span>
        ) : null}
        {message.meta?.durationMs ? (
          <span className="text-slate-500">
            · 用时 {(message.meta.durationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      {isUser ? (
        <div className="text-sm text-slate-200 whitespace-pre-wrap">{message.content}</div>
      ) : (
        <SectionedReport source={stripFlows(message.content)} />
      )}
      {!isUser && caseId && trace !== undefined && (
        <TraceTimeline trace={trace} />
      )}
    </div>
  );
}
