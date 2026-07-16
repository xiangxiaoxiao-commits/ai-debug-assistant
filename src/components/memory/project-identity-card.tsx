'use client';
import { useState } from 'react';
import type { Project, ProjectIdentity } from '@/domain/memory';
import { api } from '@/client/api';

interface Props {
  project: Project;
  onUpdate: (p: Project) => void;
}

export function ProjectIdentityCard({ project, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const identity = project.identity;

  // Edit state
  const [techStack, setTechStack] = useState(identity?.techStack?.join(', ') ?? '');
  const [languages, setLanguages] = useState(identity?.languages?.join(', ') ?? '');
  const [layout, setLayout] = useState(identity?.layout ?? '');
  const [conventions, setConventions] = useState(identity?.conventions?.join('\n') ?? '');

  const startEdit = () => {
    setTechStack(identity?.techStack?.join(', ') ?? '');
    setLanguages(identity?.languages?.join(', ') ?? '');
    setLayout(identity?.layout ?? '');
    setConventions(identity?.conventions?.join('\n') ?? '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<ProjectIdentity> = {
        techStack: techStack ? techStack.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        languages: languages ? languages.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        layout: layout.trim() || undefined,
        conventions: conventions ? conventions.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user',
      };
      const r = await api.updateProjectIdentity(project.id, patch);
      onUpdate(r.project);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-slate-800 rounded bg-slate-900/40 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-200">{project.name}</span>
        <span className="text-[10px] text-slate-500">{project.memoryCount} 条记忆</span>
        <div className="flex-1" />
        {!editing && (
          <button onClick={startEdit} className="text-[11px] text-slate-400 hover:text-slate-200">编辑</button>
        )}
      </div>

      {project.repoPath && (
        <div className="text-[11px] text-slate-500 truncate">{project.repoPath}</div>
      )}

      {error && (
        <div className="text-[11px] text-rose-400 flex items-center gap-1">
          ⚠ {error}
          <button onClick={() => setError(null)} className="ml-auto text-slate-500">×</button>
        </div>
      )}

      {editing ? (
        <div className="space-y-1.5">
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">技术栈（逗号分隔）</div>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              value={techStack}
              onChange={e => setTechStack(e.target.value)}
              placeholder="Spring Boot, Redis, MySQL"
            />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">语言（逗号分隔）</div>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              value={languages}
              onChange={e => setLanguages(e.target.value)}
              placeholder="Java, SQL"
            />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">目录结构</div>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              value={layout}
              onChange={e => setLayout(e.target.value)}
              placeholder="Maven 多模块"
            />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">规范（每行一条）</div>
            <textarea
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 resize-none"
              rows={3}
              value={conventions}
              onChange={e => setConventions(e.target.value)}
              placeholder="使用 SLF4J 日志&#10;SQL 参数化查询"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving}
              className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
            >{saving ? '保存中…' : '保存'}</button>
            <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200">取消</button>
          </div>
        </div>
      ) : identity ? (
        <div className="space-y-1 text-[11px] text-slate-400">
          {identity.techStack?.length ? <div><span className="text-slate-500">技术栈:</span> {identity.techStack.join(', ')}</div> : null}
          {identity.languages?.length ? <div><span className="text-slate-500">语言:</span> {identity.languages.join(', ')}</div> : null}
          {identity.layout ? <div><span className="text-slate-500">结构:</span> {identity.layout}</div> : null}
          {identity.conventions?.length ? (
            <div>
              <div className="text-slate-500">规范:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {identity.conventions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 italic">暂无 Identity，点击编辑填写</div>
      )}
    </div>
  );
}
