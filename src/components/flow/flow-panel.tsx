'use client';
import { useState, useMemo } from 'react';
import type { Message } from '@/domain/types';
import { extractFlows } from '@/lib/flow-extract';

interface HistoryFlow {
  raw: string;
  round: number;
  createdAt: string;
}

interface Props {
  messages: Message[];
  streamingText?: string;
  streamingStatus?: 'idle' | 'streaming' | 'done' | 'error';
}

function renderLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\[[A-Za-z_][\w./-]*[:：]\d+\])|(✗|⚠)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    if (m[1]) {
      parts.push(<span key={idx++} className="text-blue-400">{m[1]}</span>);
    } else if (m[2] === '✗') {
      parts.push(<span key={idx++} className="text-rose-400">{m[2]}</span>);
    } else if (m[2] === '⚠') {
      parts.push(<span key={idx++} className="text-amber-400">{m[2]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : line;
}

function FlowDiagram({ raw }: { raw: string }) {
  return (
    <pre className="bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-slate-200 whitespace-pre">
      {raw.split('\n').map((line, i) => (
        <div key={i}>{renderLine(line) || ' '}</div>
      ))}
    </pre>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="text-slate-500 text-sm mb-1">执行流程图</div>
      <div className="text-slate-600 text-xs leading-relaxed">
        AI 分析涉及代码执行时<br />会在这里展示流程图
      </div>
    </div>
  );
}

export function FlowPanel({ messages, streamingText = '', streamingStatus = 'idle' }: Props) {
  const [tab, setTab] = useState<'current' | 'history'>('current');

  // Collect history flows from all assistant messages
  const historyFlows = useMemo<HistoryFlow[]>(() => {
    const result: HistoryFlow[] = [];
    let round = 0;
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      round++;
      const flows = extractFlows(msg.content);
      for (const raw of flows) {
        result.push({ raw, round, createdAt: msg.createdAt });
      }
    }
    return result;
  }, [messages]);

  // Current flow: streaming if active, else last assistant message flow
  const currentFlow = useMemo<string | null>(() => {
    if (streamingStatus === 'streaming' && streamingText) {
      const flows = extractFlows(streamingText);
      if (flows.length > 0) return flows[flows.length - 1];
    }
    // Look from end of messages for latest flow
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const flows = extractFlows(msg.content);
      if (flows.length > 0) return flows[flows.length - 1];
    }
    return null;
  }, [messages, streamingText, streamingStatus]);

  const historyCount = historyFlows.length;

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0">
        <span className="text-xs text-slate-400">执行流程图</span>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('current')}
            className={`text-[11px] px-2 py-0.5 rounded ${tab === 'current' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
          >
            当前
          </button>
          <button
            onClick={() => setTab('history')}
            className={`text-[11px] px-2 py-0.5 rounded ${tab === 'history' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
          >
            历史{historyCount > 0 ? `(${historyCount})` : ''}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'current' ? (
          currentFlow ? (
            <FlowDiagram raw={currentFlow} />
          ) : (
            <EmptyState />
          )
        ) : (
          historyFlows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {historyFlows.map((hf, i) => (
                <div key={i}>
                  <div className="text-[11px] text-slate-500 mb-1">
                    第 {hf.round} 轮 · {new Date(hf.createdAt).toLocaleString()}
                  </div>
                  <FlowDiagram raw={hf.raw} />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
