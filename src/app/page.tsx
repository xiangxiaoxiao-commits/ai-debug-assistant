'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaseIndexEntry, Message, BugSummary, BugStatus, Trace } from '@/domain/types';
import type { ModelCandidate } from '@/domain/model-config';
import { api } from '@/client/api';
import { Header } from '@/components/layout/header';
import { SidebarTabs, type SidebarTab } from '@/components/layout/sidebar-tabs';
import { BugList } from '@/components/bug/bug-list';
import { SummaryCard } from '@/components/bug/summary-card';
import { Conversation } from '@/components/bug/conversation';
import { Composer } from '@/components/bug/composer';
import { PlaybookCard } from '@/components/playbook/playbook-card';
import { MemoryPanel } from '@/components/memory/memory-panel';
import { QuickForm, type QuickFormValue } from '@/components/analyze/quick-form';
import { ConfigBanner } from '@/components/analyze/config-banner';
import { SettingsModal } from '@/components/settings/settings-modal';
import { FlowPanel } from '@/components/flow/flow-panel';
import { HintCard } from '@/components/analyze/hint-card';

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
  const [liveSteps, setLiveSteps] = useState<import('@/components/bug/live-trace').LiveStep[]>([]);
  // Right panel (flow diagram) width, resizable via drag handle. Persisted to localStorage.
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 400;
    const saved = window.localStorage.getItem('ada:flowPanelWidth');
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) && n >= 240 && n <= 900 ? n : 400;
  });
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null);

  const onFlowDragStart = useCallback((e: React.MouseEvent) => {
    dragStateRef.current = { startX: e.clientX, startW: flowPanelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragStateRef.current) return;
      const dx = dragStateRef.current.startX - ev.clientX;   // drag left = grow
      const next = Math.max(240, Math.min(900, dragStateRef.current.startW + dx));
      setFlowPanelWidth(next);
    };
    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.localStorage.setItem('ada:flowPanelWidth', String(flowPanelWidth));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [flowPanelWidth]);

  // Persist width on every change (belt-and-suspenders vs onUp)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ada:flowPanelWidth', String(flowPanelWidth));
    }
  }, [flowPanelWidth]);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('bugs');
  const [traces, setTraces] = useState<Trace[]>([]);
  // Maps assistantMessageId → traceId (populated from SSE + history load)
  const messageTraceMap = useRef<Map<string, string>>(new Map());

  // traceId → Trace lookup map
  const traceById = useMemo<Map<string, Trace>>(
    () => new Map(traces.map(t => [t.id, t])),
    [traces]
  );

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

  // Load traces for active case and build message→trace map
  const loadTraces = useCallback(async (caseId: string, msgs: Message[]) => {
    try {
      const r = await api.getCaseTraces(caseId);
      setTraces(r.traces);
      // Build map: trace.triggerRef is the user message id;
      // we find the assistant message that follows each user message
      const assistantMsgs = msgs.filter(m => m.role === 'assistant');
      const userMsgs = msgs.filter(m => m.role === 'user');
      const map = new Map<string, string>();
      for (const trace of r.traces) {
        if (!trace.triggerRef) continue;
        // Find the index of user msg with this id
        const userIdx = userMsgs.findIndex(m => m.id === trace.triggerRef);
        if (userIdx !== -1 && assistantMsgs[userIdx]) {
          map.set(assistantMsgs[userIdx].id, trace.id);
        }
      }
      messageTraceMap.current = map;
    } catch { /* non-blocking */ }
  }, []);

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
      await loadTraces(id, m.messages);
    } catch (e) { setGlobalError((e as Error).message); }
  }, [loadTraces]);

  const streamMessage = useCallback(async (caseId: string, text: string) => {
    setStreamStatus('streaming');
    setStreamingText('');
    setStreamError(null);
    setLiveSteps([]);

    let acc = '';
    let pendingUserMsgId: string | null = null;
    try {
      for await (const chunk of api.sendMessage(caseId, text)) {
        if (chunk.type === 'meta') {
          pendingUserMsgId = chunk.userMessageId;
        } else if (chunk.type === 'text') {
          acc += chunk.text;
          setStreamingText(acc);
        } else if (chunk.type === 'trace-step') {
          setLiveSteps(prev => [...prev, chunk.step]);
        } else if (chunk.type === 'summary') {
          setSummary(chunk.summary);
        } else if (chunk.type === 'trace-done') {
          // Store in ref so we can wire it after messages load
          if (chunk.assistantMessageId && chunk.traceId) {
            messageTraceMap.current.set(chunk.assistantMessageId, chunk.traceId);
          } else if (pendingUserMsgId && chunk.traceId) {
            // We'll wire after load based on userMsgId
            // Store temporarily with user msg id as key
            messageTraceMap.current.set(`__user_${pendingUserMsgId}`, chunk.traceId);
          }
        } else if (chunk.type === 'error') {
          setStreamError(chunk.message);
          setStreamStatus('error');
          return;
        } else if (chunk.type === 'done') {
          setStreamStatus('done');
          const m = await api.getMessages(caseId);
          setMessages(m.messages);
          setSummary(m.summary);
          setStreamingText('');
          setStreamStatus('idle');
          await loadTraces(caseId, m.messages);
          await refreshCases();
          return;
        }
      }
    } catch (e) {
      setStreamError((e as Error).message);
      setStreamStatus('error');
    }
  }, [refreshCases, loadTraces]);

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
      setTraces([]);
      messageTraceMap.current = new Map();
      if (v.images && v.images.length > 0) {
        try {
          await api.uploadAttachments(created.case.id, v.images, v.problem);
        } catch (e) {
          setGlobalError(`图片上传失败：${(e as Error).message}`);
        }
      }
      await refreshCases();
      await streamMessage(created.case.id, v.problem);
    } catch (e) {
      setGlobalError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFollowUp = async (text: string, images: File[]) => {
    if (!activeCaseId) return;
    setSubmitting(true);
    try {
      if (images.length > 0) {
        try {
          await api.uploadAttachments(activeCaseId, images, text || undefined);
        } catch (e) {
          setGlobalError(`图片上传失败：${(e as Error).message}`);
          return;
        }
      }
      await streamMessage(activeCaseId, text || '(用户上传了截图，请分析)');
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
        setTraces([]);
        messageTraceMap.current = new Map();
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
    setTraces([]);
    messageTraceMap.current = new Map();
  };

  return (
    <>
      <Header
        modelConfigured={modelConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewSession={activeCaseId ? handleNewCase : undefined}
      />

      <div
        className="grid gap-3 p-3 h-[calc(100vh-49px)] overflow-hidden"
        style={{ gridTemplateColumns: `280px minmax(0,1fr) 6px ${flowPanelWidth}px` }}
      >
        <aside className="rounded border border-slate-800 bg-slate-900/40 p-3 overflow-hidden flex flex-col">
          <SidebarTabs active={sidebarTab} onChange={setSidebarTab} />
          <div className="flex-1 overflow-y-auto min-h-0">
            {sidebarTab === 'bugs' ? (
              <BugList
                cases={cases}
                activeId={activeCaseId ?? undefined}
                onSelect={loadCase}
                onDelete={handleDeleteCase}
                onNew={handleNewCase}
              />
            ) : (
              <MemoryPanel onSwitchToBugs={() => setSidebarTab('bugs')} />
            )}
          </div>
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
                <PlaybookCard caseId={activeCaseId} />
                <Conversation
                  messages={messages}
                  streamingText={streamingText}
                  streamingStatus={streamStatus}
                  streamingError={streamError}
                  liveSteps={liveSteps}
                  messageTraceMap={messageTraceMap.current}
                  traceById={traceById}
                  caseId={activeCaseId}
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
              <HintCard />
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

        <div
          onMouseDown={onFlowDragStart}
          className="cursor-col-resize hover:bg-slate-700 bg-slate-800/50 rounded-full transition-colors"
          title="拖动调整流程图面板宽度"
        />

        <FlowPanel messages={messages} streamingText={streamingText} streamingStatus={streamStatus} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => { setModelConfigured(true); refreshDiscover(); }}
      />
    </>
  );
}
