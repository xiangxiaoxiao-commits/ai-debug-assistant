'use client';
import { useEffect, useRef } from 'react';
import type { Message } from '@/domain/types';
import { Markdown } from '@/lib/markdown';

interface Props {
  messages: Message[];
  streamingText: string;
  streamingStatus: 'idle' | 'streaming' | 'done' | 'error';
  streamingError: string | null;
}

export function Conversation({ messages, streamingText, streamingStatus, streamingError }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingText, streamingStatus]);

  return (
    <div className="space-y-3">
      {messages.filter(m => m.role !== 'system-summary').map(m => (
        <Bubble key={m.id} message={m} />
      ))}

      {streamingStatus === 'streaming' && (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <div className="text-[10px] uppercase tracking-wide text-yellow-400 mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            AI 分析中…
          </div>
          <Markdown source={streamingText || '（等待模型返回…）'} />
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

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`rounded-lg border p-3 ${
      isUser
        ? 'bg-blue-950/30 border-blue-900/60'
        : 'bg-slate-900/60 border-slate-800'
    }`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide mb-2">
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
        <Markdown source={message.content} />
      )}
    </div>
  );
}
