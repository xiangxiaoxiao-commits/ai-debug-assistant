'use client';

interface HeaderProps {
  modelConfigured: boolean;
  onOpenSettings: () => void;
  onNewSession?: () => void;
}

export function Header({ modelConfigured, onOpenSettings, onNewSession }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 py-2 flex items-center gap-3">
      <div className="text-base font-semibold">AI Debug Assistant</div>
      <span
        className={`text-[10px] px-2 py-0.5 rounded ${
          modelConfigured ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-700 text-slate-300'
        }`}
      >
        {modelConfigured ? '● 已配置' : '○ 未配置'}
      </span>
      <div className="flex-1" />
      {onNewSession && (
        <button
          onClick={onNewSession}
          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          + 新分析
        </button>
      )}
      <button
        onClick={onOpenSettings}
        title="模型配置"
        className="text-slate-300 hover:text-white w-8 h-8 rounded hover:bg-slate-800 flex items-center justify-center"
      >
        ⚙
      </button>
    </header>
  );
}
