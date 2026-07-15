'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CaseIndexEntry } from '@/domain/types';
import type { ModelCandidate } from '@/domain/model-config';
import { api } from '@/client/api';
import { Header } from '@/components/layout/header';
import { CaseList } from '@/components/case/case-list';
import { QuickForm, type QuickFormValue } from '@/components/analyze/quick-form';
import { ReportStream } from '@/components/analyze/report-stream';
import { ConfigBanner } from '@/components/analyze/config-banner';
import { SettingsModal } from '@/components/settings/settings-modal';

export default function HomePage() {
  const [modelConfigured, setModelConfigured] = useState(false);
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [cases, setCases] = useState<CaseIndexEntry[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [historyProblem, setHistoryProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshDiscover = useCallback(async () => {
    try {
      const r = await api.discoverConfig();
      setCandidates(r.candidates);
      setModelConfigured(Boolean(r.saved));
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  }, []);

  const refreshCases = useCallback(async () => {
    try {
      const r = await api.listCases();
      setCases(r.cases);
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refreshDiscover();
    refreshCases();
  }, [refreshDiscover, refreshCases]);

  const handleAnalyze = async (v: QuickFormValue) => {
    if (!modelConfigured) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      const firstLine = v.problem.split('\n').find(l => l.trim())?.trim() ?? '排障问题';
      const payload = {
        problem: {
          actual: v.problem,
          expected: '正常工作 / 见问题描述',
          entry: v.entry || firstLine.slice(0, 80),
          environment: v.environment || '见问题描述'
        },
        meta: {
          ...(v.repoPath ? { repoPath: v.repoPath } : {}),
          ...(v.module ? { module: v.module } : {})
        }
      };
      const created = await api.createCase(payload);
      await api.quickIngest(created.case.id, v.problem);
      setActiveCaseId(created.case.id);
      setHistoryProblem(null);
      setRunToken(t => t + 1);
      await refreshCases();
    } catch (e) {
      setGlobalError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectHistory = async (id: string) => {
    try {
      const r = await api.getCase(id);
      setActiveCaseId(id);
      setHistoryProblem(r.case.problem.actual);
      setRunToken(t => t + 1);
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  };

  const handleDeleteCase = async (id: string) => {
    try {
      await api.deleteCase(id);
      if (activeCaseId === id) {
        setActiveCaseId(null);
        setHistoryProblem(null);
      }
      await refreshCases();
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  };

  const handleNewSession = () => {
    setActiveCaseId(null);
    setHistoryProblem(null);
    setRunToken(0);
  };

  const handleRerun = () => {
    if (activeCaseId) setRunToken(t => t + 1);
  };

  return (
    <>
      <Header
        modelConfigured={modelConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewSession={activeCaseId ? handleNewSession : undefined}
      />

      <div className="grid grid-cols-[240px_1fr] gap-3 p-3 h-[calc(100vh-49px)] overflow-hidden">
        <aside className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">历史记录</div>
          <CaseList
            cases={cases}
            activeId={activeCaseId ?? undefined}
            onSelect={handleSelectHistory}
            onDelete={handleDeleteCase}
          />
        </aside>

        <main className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-4">
          {!modelConfigured && (
            <ConfigBanner
              candidates={candidates}
              onConfigured={() => { setModelConfigured(true); refreshDiscover(); }}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}

          {globalError && (
            <div className="mb-3 border border-rose-800 bg-rose-950/30 rounded p-2 text-xs text-rose-300 flex items-center gap-2">
              <span>⚠ {globalError}</span>
              <button onClick={() => setGlobalError(null)} className="ml-auto text-slate-400 hover:text-slate-200">×</button>
            </div>
          )}

          {historyProblem !== null ? (
            <div className="space-y-3">
              <div className="border border-slate-800 rounded p-3 bg-slate-900/40">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">历史查看</div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {historyProblem}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleRerun}
                    disabled={!modelConfigured}
                    className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700"
                  >
                    重新分析
                  </button>
                  <button
                    onClick={handleNewSession}
                    className="text-xs px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    ← 新建
                  </button>
                </div>
              </div>
              <ReportStream caseId={activeCaseId} runToken={runToken} />
            </div>
          ) : (
            <>
              <QuickForm
                disabled={!modelConfigured}
                submitting={submitting}
                onSubmit={handleAnalyze}
              />
              <ReportStream caseId={activeCaseId} runToken={runToken} />
            </>
          )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => { setModelConfigured(true); refreshDiscover(); }}
      />
    </>
  );
}
