'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type AnalyzeChunk } from '@/client/api';
import { Markdown } from '@/lib/markdown';

interface Props {
  caseId: string | null;
  runToken: number;                     // increment to trigger a new run
  onDone?: () => void;
}

type Status = 'idle' | 'streaming' | 'done' | 'error';

interface Meta { evidences: number; codeSnippets: number; promptChars: number; }

export function ReportStream({ caseId, runToken, onDone }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const abortRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!caseId || runToken === 0) return;
    abortRef.current = false;
    setStatus('streaming');
    setText('');
    setMeta(null);
    setError(null);
    setStartAt(Date.now());
    setDurationMs(null);

    (async () => {
      try {
        for await (const chunk of api.analyzeStream(caseId) as AsyncGenerator<AnalyzeChunk>) {
          if (abortRef.current) break;
          if (chunk.type === 'meta') {
            setMeta({ evidences: chunk.evidences, codeSnippets: chunk.codeSnippets, promptChars: chunk.promptChars });
          } else if (chunk.type === 'text') {
            setText(prev => prev + chunk.text);
          } else if (chunk.type === 'error') {
            setError(chunk.message);
            setStatus('error');
            return;
          } else if (chunk.type === 'done') {
            setStatus('done');
            setDurationMs(Date.now() - (startAt ?? Date.now()));
            onDone?.();
            return;
          }
        }
        if (!abortRef.current && status === 'streaming') {
          setStatus('done');
          setDurationMs(Date.now() - (startAt ?? Date.now()));
        }
      } catch (e) {
        if (!abortRef.current) {
          setError((e as Error).message);
          setStatus('error');
        }
      }
    })();

    return () => { abortRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, runToken]);

  useEffect(() => {
    // Auto-scroll to bottom during streaming
    if (status === 'streaming' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, status]);

  if (status === 'idle') return null;

  return (
    <div className="mt-6 border border-slate-800 rounded bg-slate-900/40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">分析报告</span>
          {meta && (
            <span className="text-slate-500">
              证据 {meta.evidences} 条 · 代码片段 {meta.codeSnippets} 个 · Prompt {(meta.promptChars / 1000).toFixed(1)}K 字符
            </span>
          )}
        </div>
        <div>
          {status === 'streaming' && <span className="text-yellow-400 animate-pulse">● 分析中…</span>}
          {status === 'done' && <span className="text-emerald-400">✓ 完成{durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}</span>}
          {status === 'error' && <span className="text-rose-400">✗ 出错</span>}
        </div>
      </div>
      <div ref={scrollRef} className="p-4 max-h-[60vh] overflow-y-auto">
        {error ? (
          <div className="text-rose-300 text-sm">
            <div className="font-medium mb-1">分析失败</div>
            <div className="text-xs text-rose-400/80">{error}</div>
          </div>
        ) : (
          <Markdown source={text || '（等待模型返回…）'} />
        )}
      </div>
    </div>
  );
}
