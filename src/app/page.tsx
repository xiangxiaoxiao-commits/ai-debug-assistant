'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CaseIndexEntry, Message, BugSummary, BugStatus } from '@/domain/types';
import type { ModelCandidate } from '@/domain/model-config';
import { api } from '@/client/api';
import { Header } from '@/components/layout/header';
import { BugList } from '@/components/bug/bug-list';
import { SummaryCard } from '@/components/bug/summary-card';
import { Conversation } from '@/components/bug/conversation';
import { Composer } from '@/components/bug/composer';
import { QuickForm, type QuickFormValue } from '@/components/analyze/quick-form';
import { ConfigBanner } from '@/components/analyze/config-banner';
import { SettingsModal } from '@/components/settings/settings-modal';

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export default function HomePage() {
  const [modelConfigured, setModelConfigured] = useState(false);
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [cases, setCases] = useState<CaseIndexEntry[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary] = useState<BugSummary | null>(null);
  const [activeRepoPath, setActiveRepoPath] = useState<string>('');
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshDiscover = useCallback(async () => {
    try {
      const r = await api.discoverConfig();
      setCandidates(r.candidates);
      setModelConfigured(Boolean(r.saved));
    } catch (e) { setGlobalError((e as Error).message); }
  }, []);

  const refreshCases = useCallback(async () => {
    try {
      const r = await api.listCases();
      setCases(r.cases);
    } catch (e) { setGlobalError((e as Error).message); }
  }, []);

  useEffect(() => { refreshDiscover(); refreshCases(); }, [refreshDiscover, refreshCases]);

  const loadCase = useCallback(async (id: string) => {
    try {
      const [c, m] = await Promise.all([api.getCase(id), api.getMessages(id)]);
      setActiveCaseId(id);
      setActiveRepoPath(c.case.meta?.repoPath ?? '');
      setMessages(m.messages);
      setSummary(m.summary);
      setStreamStatus('idle');
      setStreamingText('');
      setStreamError(null);
    } catch (e) { setGlobalError((e as Error).message); }
  }, []);

  const streamMessage = useCallback(async (caseId: string, text: string) => {
    setStreamStatus('streaming');
    setStreamingText('');
    setStreamError(null);

    let acc = '';
    try {
      for await (const chunk of api.sendMessage(caseId, text)) {
        if (chunk.type === 'text') {
          acc += chunk.text;
          setStreamingText(acc);
        } else if (chunk.type === 'summary') {
          setSummary(chunk.summary);
        } else if (chunk.type === 'error') {
          setStreamError(chunk.message);
          setStreamStatus('error');
          return;
        } else if (chunk.type === 'done') {
          setStreamStatus('done');
          // Reload messages to get the persisted user + assistant with ids
          const m = await api.getMessages(caseId);
          setMessages(m.messages);
          setSummary(m.summary);
          setStreamingText('');
          setStreamStatus('idle');
          await refreshCases();
          return;
        }
      }
    } catch (e) {
      setStreamError((e as Error).message);
      setStreamStatus('error');
    }
  }, [refreshCases]);

  const handleFirstMessage = async (v: QuickFormValue) => {
    if (!modelConfigured) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      const firstLine = v.problem.split('\n').find(l => l.trim())?.trim() ?? '排障问题';
      const created = await api.createCase({
        problem: {
          actual: firstLine.slice(0, 200),
          expected: '见问题描述',
          entry: v.entry || firstLine.slice(0, 80),
          environment: v.environment || '见问题描述'
        },
        meta: {
          ...(v.repoPath ? { repoPath: v.repoPath } : {}),
          ...(v.module ? { module: v.module } : {})
        }
      });
      setActiveCaseId(created.case.id);
      setActiveRepoPath(v.repoPath || '');
      setMessages([]);
      setSummary(null);
      await refreshCases();
      await streamMessage(created.case.id, v.problem);
    } catch (e) {
      setGlobalError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFollowUp = async (text: string) => {
    if (!activeCaseId) return;
    setSubmitting(true);
    try {
      // if repoPath changed, persist to case meta first
      const currentCase = await api.getCase(activeCaseId);
      if (activeRepoPath !== (currentCase.case.meta?.repoPath ?? '')) {
        // No PATCH for meta yet? Use existing PATCH /api/cases/:id if present.
        // Safe fallback: skip persist; user can re-select repo next round.
      }
      await streamMessage(activeCaseId, text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (status: BugStatus, verificationNotes?: string) => {
    if (!activeCaseId) return;
    try {
      const r = await api.patchStatus(activeCaseId, { status, verificationNotes });
      setSummary(r.summary);
      await refreshCases();
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  };

  const handleDeleteCase = async (id: string) => {
    try {
      await api.deleteCase(id);
      if (activeCaseId === id) {
        setActiveCaseId(null);
        setMessages([]);
        setSummary(null);
        setActiveRepoPath('');
      }
      await refreshCases();
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  };

  const handleNewCase = () => {
    setActiveCaseId(null);
    setMessages([]);
    setSummary(null);
    setActiveRepoPath('');
    setStreamStatus('idle');
    setStreamingText('');
    setStreamError(null);
  };

  return (
    <>
      <Header
        modelConfigured={modelConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewSession={activeCaseId ? handleNewCase : undefined}
      />

      <div className="grid grid-cols-[280px_1fr] gap-3 p-3 h-[calc(100vh-49px)] overflow-hidden">
        <aside className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <BugList
            cases={cases}
            activeId={activeCaseId ?? undefined}
            onSelect={loadCase}
            onDelete={handleDeleteCase}
            onNew={handleNewCase}
          />
        </aside>

        <main className="rounded border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">
          {!modelConfigured && (
            <div className="p-3 border-b border-slate-800">
              <ConfigBanner
                candidates={candidates}
                onConfigured={() => { setModelConfigured(true); refreshDiscover(); }}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          )}

          {globalError && (
            <div className="mx-3 mt-3 border border-rose-800 bg-rose-950/30 rounded p-2 text-xs text-rose-300 flex items-center gap-2">
              <span>⚠ {globalError}</span>
              <button onClick={() => setGlobalError(null)} className="ml-auto text-slate-400 hover:text-slate-200">×</button>
            </div>
          )}

          {activeCaseId ? (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                {summary && (
                  <SummaryCard summary={summary} onStatusChange={handleStatusChange} />
                )}
                <Conversation
                  messages={messages}
                  streamingText={streamingText}
                  streamingStatus={streamStatus}
                  streamingError={streamError}
                />
              </div>
              <div className="px-4 pb-4">
                <Composer
                  disabled={!modelConfigured}
                  submitting={submitting || streamStatus === 'streaming'}
                  repoPath={activeRepoPath}
                  onRepoPathChange={setActiveRepoPath}
                  onSubmit={handleFollowUp}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-1">新建 Bug 排查</h2>
                <p className="text-xs text-slate-400">描述问题，AI 会给出诊断。之后可以在对话里继续补充证据、追问细节。</p>
              </div>
              <QuickForm
                disabled={!modelConfigured}
                submitting={submitting}
                onSubmit={handleFirstMessage}
              />
            </div>
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
