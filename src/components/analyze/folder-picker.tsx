'use client';
import { useCallback, useEffect, useState } from 'react';

interface Entry { name: string; isRepo: boolean; }
interface BrowseResp {
  path: string;
  parent: string | null;
  entries: Entry[];
  isRepo: boolean;
  home: string;
  error?: string;
}

interface Props {
  open: boolean;
  initialPath?: string;
  onClose: () => void;
  onPick: (path: string) => void;
}

export function FolderPicker({ open, initialPath, onClose, onPick }: Props) {
  const [data, setData] = useState<BrowseResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');

  const load = useCallback(async (p?: string) => {
    setLoading(true);
    setErr(null);
    try {
      const url = p ? `/api/fs/browse?path=${encodeURIComponent(p)}` : '/api/fs/browse';
      const res = await fetch(url);
      const body = (await res.json()) as BrowseResp;
      setData(body);
      if (body.error) setErr(body.error);
      setManualPath(body.path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load(initialPath && initialPath.trim() ? initialPath : undefined);
  }, [open, initialPath, load]);

  if (!open) return null;

  const pickCurrent = () => {
    if (data?.path) {
      onPick(data.path);
      onClose();
    }
  };

  const goInto = (name: string) => {
    if (!data) return;
    const next = data.path.endsWith('/') ? data.path + name : `${data.path}/${name}`;
    load(next);
  };

  const goParent = () => {
    if (data?.parent) load(data.parent);
  };

  const goHome = () => load(data?.home);

  return (
    <div className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-base font-semibold">选择代码仓库目录</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">×</button>
        </div>

        <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
          <button
            onClick={goParent}
            disabled={!data?.parent}
            className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
          >↑ 上级</button>
          <button
            onClick={goHome}
            className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
          >⌂ 主目录</button>
          <input
            type="text"
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
            value={manualPath}
            onChange={e => setManualPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(manualPath); }}
            placeholder="直接输入路径然后回车"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading && <div className="text-xs text-slate-400 py-4">加载中…</div>}
          {err && <div className="text-xs text-rose-400 py-2">⚠ {err}</div>}
          {data && !loading && (
            <>
              <div className="text-[11px] text-slate-500 mb-2 font-mono break-all">
                当前：{data.path} {data.isRepo && <span className="text-emerald-400 ml-1">● Git 仓库</span>}
              </div>
              {data.entries.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  （此目录下没有可显示的子目录）
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {data.entries.map(e => (
                    <li
                      key={e.name}
                      onDoubleClick={() => goInto(e.name)}
                      onClick={() => goInto(e.name)}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer text-sm"
                    >
                      <span className="text-slate-500">📁</span>
                      <span className={e.isRepo ? 'text-emerald-300' : 'text-slate-200'}>
                        {e.name}
                      </span>
                      {e.isRepo && <span className="text-[10px] text-emerald-500">git</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800">
          <span className="text-[11px] text-slate-500">点击进入子目录 · 选中「使用此目录」即可</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
            >取消</button>
            <button
              onClick={pickCurrent}
              disabled={!data?.path || loading}
              className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700"
            >使用此目录</button>
          </div>
        </div>
      </div>
    </div>
  );
}
