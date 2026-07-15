'use client';
import { useState } from 'react';
import { api, type CreateCasePayload } from '@/client/api';

export function CaseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [problem, setProblem] = useState({ actual: '', expected: '', entry: '', environment: '' });
  const [meta, setMeta] = useState({ module: '', repoPath: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateCasePayload = {
        problem,
        meta: {
          ...(meta.module ? { module: meta.module } : {}),
          ...(meta.repoPath ? { repoPath: meta.repoPath } : {})
        }
      };
      const { case: created } = await api.createCase(payload);
      onCreated(created.id);
      setProblem({ actual: '', expected: '', entry: '', environment: '' });
      setMeta({ module: '', repoPath: '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">新建 Case</div>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">实际现象 <span className="text-rose-400">*</span></span>
        <textarea rows={2}
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder={'例：审批详情页面的状态列显示数字 1、2、3，而不是「已审批」「驳回」「待处理」这类中文名称'}
          value={problem.actual}
          onChange={e => setProblem({ ...problem, actual: e.target.value })} />
        <p className="text-[10px] text-slate-500">你观察到的错误行为，越具体越好</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">期望行为 <span className="text-rose-400">*</span></span>
        <textarea rows={2}
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="例：状态列应显示可读的中文名称"
          value={problem.expected}
          onChange={e => setProblem({ ...problem, expected: e.target.value })} />
        <p className="text-[10px] text-slate-500">本应发生什么</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">入口 <span className="text-rose-400">*</span></span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="例：PLJI-2458 或 https://xxx.com/approval/detail?id=123"
          value={problem.entry}
          onChange={e => setProblem({ ...problem, entry: e.target.value })} />
        <p className="text-[10px] text-slate-500">工单号、URL、或复现路径</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">环境 <span className="text-rose-400">*</span></span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="例：万联现场环境，账号 yunying，Chrome 127"
          value={problem.environment}
          onChange={e => setProblem({ ...problem, environment: e.target.value })} />
        <p className="text-[10px] text-slate-500">哪个环境、哪个用户、哪个版本</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">模块 <span className="text-slate-500">(可选)</span></span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="例：approval / billing"
          value={meta.module}
          onChange={e => setMeta({ ...meta, module: e.target.value })} />
        <p className="text-[10px] text-slate-500">业务模块或代码目录名，便于 AI 缩小分析范围</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-medium">代码仓库路径 <span className="text-slate-500">(可选)</span></span>
        <input
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          placeholder="例：/Users/you/work/backend"
          value={meta.repoPath}
          onChange={e => setMeta({ ...meta, repoPath: e.target.value })} />
        <p className="text-[10px] text-slate-500">Phase 4 起会用来搜代码；现在填也没影响</p>
      </label>

      {error && <div className="text-xs text-rose-400">⚠ 校验失败：{error}</div>}
      <button
        disabled={submitting}
        onClick={submit}
        className="w-full text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-1.5"
      >
        {submitting ? '创建中…' : '创建 Case'}
      </button>
    </div>
  );
}
