'use client';
import { cn } from '@/lib/cn';

interface HeaderProps {
  modelConfigured: boolean;
  currentCaseTitle?: string;
  onExport?: () => void;
}

export function Header({ modelConfigured, currentCaseTitle, onExport }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 py-2 flex items-center gap-4">
      <div className="text-base font-semibold">AI Debug Assistant</div>
      <div className={cn('text-xs px-2 py-0.5 rounded', modelConfigured ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-700 text-slate-300')}>
        {modelConfigured ? '● 模型已配置' : '○ 未配置模型'}
      </div>
      <div className="flex-1 text-sm text-slate-400 truncate">
        {currentCaseTitle ?? '未选择 Case'}
      </div>
      {onExport && (
        <button onClick={onExport} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
          导出 JSON
        </button>
      )}
    </header>
  );
}
