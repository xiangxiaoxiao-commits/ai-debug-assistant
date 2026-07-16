'use client';

type SidebarTab = 'bugs' | 'memory';

interface Props {
  active: SidebarTab;
  onChange: (tab: SidebarTab) => void;
}

export function SidebarTabs({ active, onChange }: Props) {
  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'bugs', label: 'Bug 列表' },
    { id: 'memory', label: '项目档案' },
  ];

  return (
    <div className="flex gap-1 mb-2 border-b border-slate-800 pb-2">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`text-[11px] px-2 py-1 rounded border ${
            active === t.id
              ? 'bg-slate-700/60 border-slate-600 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export type { SidebarTab };
