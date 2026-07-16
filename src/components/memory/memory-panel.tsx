'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Project, MemoryEntry } from '@/domain/memory';
import { api } from '@/client/api';
import { ProjectSelector } from './project-selector';
import { ProjectIdentityCard } from './project-identity-card';
import { MemoryList } from './memory-list';

interface Props {
  onSwitchToBugs?: () => void;
}

export function MemoryPanel({ onSwitchToBugs }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setError(null);
    try {
      const r = await api.listMemoryProjects();
      setProjects(r.projects);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadProjectDetail = useCallback(async (id: string) => {
    setMemoriesLoading(true);
    setError(null);
    try {
      const [pr, mr] = await Promise.all([
        api.getMemoryProject(id),
        api.listMemories(id),
      ]);
      setSelectedProject(pr.project);
      setMemories(mr.memories);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    loadProjectDetail(id);
  };

  const handleProjectUpdate = (p: Project) => {
    setSelectedProject(p);
    setProjects(prev => prev.map(x => x.id === p.id ? p : x));
  };

  const handleMemoryUpdate = (updated: MemoryEntry) => {
    setMemories(prev => prev.map(m => m.id === updated.id ? updated : m));
  };

  const handleMemoryDelete = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
    if (selectedProject) {
      setSelectedProject({ ...selectedProject, memoryCount: Math.max(0, selectedProject.memoryCount - 1) });
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">项目档案</div>

      {error && (
        <div className="text-[11px] text-rose-400 flex items-center gap-1">
          ⚠ {error}
          <button onClick={() => setError(null)} className="ml-auto text-slate-500">×</button>
        </div>
      )}

      <ProjectSelector
        projects={projects}
        selectedId={selectedId}
        loading={projectsLoading}
        onSelect={handleSelect}
      />

      {!projectsLoading && projects.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="text-xs text-slate-400">还没有项目档案</div>
          <div className="text-[11px] text-slate-600 px-2 leading-relaxed">
            新建 Bug 时会自动按代码仓库路径归属到项目，记忆就会积累起来
          </div>
          {onSwitchToBugs && (
            <button
              onClick={onSwitchToBugs}
              className="mt-1 text-[11px] px-3 py-1 rounded border border-slate-700 text-slate-300 hover:text-slate-100 hover:border-slate-500"
            >
              新建 Bug
            </button>
          )}
        </div>
      )}

      {memoriesLoading && (
        <div className="text-xs text-slate-500">加载中…</div>
      )}

      {selectedProject && !memoriesLoading && (
        <>
          <ProjectIdentityCard
            project={selectedProject}
            onUpdate={handleProjectUpdate}
          />
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            <MemoryList
              projectId={selectedProject.id}
              memories={memories}
              onUpdate={handleMemoryUpdate}
              onDelete={handleMemoryDelete}
            />
          </div>
        </>
      )}

      {!selectedId && !projectsLoading && projects.length > 0 && (
        <div className="text-xs text-slate-500 italic">选择一个项目查看其记忆</div>
      )}
    </div>
  );
}
