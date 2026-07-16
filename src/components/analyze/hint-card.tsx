'use client';
import { useState } from 'react';

const CAPABILITIES = [
  { icon: '🔍', title: '对话式排障', desc: '多轮追问 / 修正，AI 根据你补充的证据持续更新诊断。' },
  { icon: '📋', title: '结构化档案', desc: '每个 Bug 一个 Case，状态可跟踪，历史可回溯。' },
  { icon: '🧠', title: '项目记忆', desc: '越用越懂你的项目——根因、修复方案都会积累下来。' },
  { icon: '👁️', title: '可观测', desc: 'AI 每步在干嘛都能看：执行链路、耗时、状态一目了然。' },
];

export function HintCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {CAPABILITIES.map(c => (
          <div key={c.title} className="flex items-center gap-1.5 text-slate-400">
            <span>{c.icon}</span>
            <span className="text-slate-300 font-medium">{c.title}</span>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-800 pt-3">
          {CAPABILITIES.map(c => (
            <div key={c.title} className="flex gap-1.5 text-slate-500 leading-relaxed">
              <span className="flex-shrink-0">{c.icon}</span>
              <span>{c.desc}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
      >
        {expanded ? '收起 ▴' : '了解更多 ▾'}
      </button>
    </div>
  );
}
