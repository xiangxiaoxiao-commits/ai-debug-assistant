import type { ReactNode } from 'react';

interface Props {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function ThreeColumn({ left, center, right }: Props) {
  return (
    <div className="grid grid-cols-[320px_1fr_360px] gap-3 p-3 h-[calc(100vh-49px)] overflow-hidden">
      <aside className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{left}</aside>
      <section className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{center}</section>
      <aside className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{right}</aside>
    </div>
  );
}
