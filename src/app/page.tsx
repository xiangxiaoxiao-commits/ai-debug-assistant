'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Case, CaseIndexEntry, Evidence, EvidenceType } from '@/domain/types';
import { api } from '@/client/api';
import { Header } from '@/components/layout/header';
import { ThreeColumn } from '@/components/layout/three-column';
import { ModelConfig } from '@/components/case/model-config';
import { CaseForm } from '@/components/case/case-form';
import { CaseList } from '@/components/case/case-list';
import { EvidencePanel } from '@/components/evidence/evidence-panel';
import { PipelineBar } from '@/components/pipeline/pipeline-bar';

const ACTIVE_KEY = 'ada:active-case';

export default function HomePage() {
  const [modelConfigured, setModelConfigured] = useState(false);
  const [cases, setCases] = useState<CaseIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [current, setCurrent] = useState<{ case: Case; evidence: Evidence[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    const { cases } = await api.listCases();
    setCases(cases);
  }, []);

  const loadCase = useCallback(async (id: string) => {
    try {
      const data = await api.getCase(id);
      setCurrent(data);
      setActiveId(id);
      sessionStorage.setItem(ACTIVE_KEY, id);
    } catch (e) {
      setError((e as Error).message);
      setCurrent(null);
      setActiveId(undefined);
      sessionStorage.removeItem(ACTIVE_KEY);
    }
  }, []);

  useEffect(() => {
    refreshCases().catch(e => setError((e as Error).message));
    const stored = sessionStorage.getItem(ACTIVE_KEY);
    if (stored) loadCase(stored);
  }, [refreshCases, loadCase]);

  const handleCreated = async (id: string) => {
    await refreshCases();
    await loadCase(id);
  };

  const handleDelete = async (id: string) => {
    await api.deleteCase(id);
    if (activeId === id) {
      setActiveId(undefined);
      setCurrent(null);
      sessionStorage.removeItem(ACTIVE_KEY);
    }
    await refreshCases();
  };

  const handleAddEvidence = async (type: EvidenceType, content: string) => {
    if (!activeId) return;
    await api.addEvidence(activeId, { type, content });
    await loadCase(activeId);
    await refreshCases();
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    if (!activeId) return;
    await api.deleteEvidence(activeId, evidenceId);
    await loadCase(activeId);
    await refreshCases();
  };

  return (
    <>
      <Header
        modelConfigured={modelConfigured}
        currentCaseTitle={current?.case.problem.actual.split('\n')[0]}
        onExport={activeId ? () => window.open(api.exportCase(activeId), '_blank') : undefined}
      />
      <ThreeColumn
        left={
          <div className="space-y-4">
            <ModelConfig onChange={setModelConfigured} />
            <CaseForm onCreated={handleCreated} />
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">历史 Case</div>
              <CaseList cases={cases} activeId={activeId} onSelect={loadCase} onDelete={handleDelete} />
            </div>
          </div>
        }
        center={
          current ? (
            <div className="space-y-4">
              <PipelineBar pipeline={current.case.pipeline} />
              <EvidencePanel
                currentCase={current.case}
                evidence={current.evidence}
                onAdd={handleAddEvidence}
                onDelete={handleDeleteEvidence}
              />
            </div>
          ) : (
            <div className="text-center text-slate-500 py-16 text-sm">
              选择左侧一个 Case，或点「创建 Case」开始一次排障。
            </div>
          )
        }
        right={
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">报告</div>
            <div className="text-xs text-slate-500">
              Phase 1 未接入 LLM。Phase 2 完成后此处将展示结构化诊断报告。
            </div>
            {error && <div className="text-xs text-rose-400">{error}</div>}
          </div>
        }
      />
    </>
  );
}
