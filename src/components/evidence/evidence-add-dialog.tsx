'use client';
import { useState } from 'react';
import { EVIDENCE_TYPES } from '@/domain/constants';
import type { EvidenceType } from '@/domain/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (type: EvidenceType, content: string) => Promise<void>;
}

const TYPE_LABELS: Record<EvidenceType, { label: string; desc: string; placeholder: string }> = {
  curl: {
    label: 'cURL 命令',
    desc: '从浏览器 Network 面板「Copy as cURL」粘贴，让 AI 看到真实请求和响应',
    placeholder: "curl -X GET 'https://api.example.com/approval/detail?id=123' \\\n  -H 'Cookie: session=abc123' \\\n  -H 'Authorization: Bearer token'"
  },
  har: {
    label: 'HAR 文件',
    desc: '浏览器 Network 面板「另存为 HAR」的文本内容',
    placeholder: '{"log":{"version":"1.2","entries":[...]}}'
  },
  log: {
    label: '应用日志',
    desc: '后端/前端的错误日志、堆栈信息',
    placeholder: 'ERROR [2024-01-01 10:00:00] c.e.ApprovalService - NullPointerException\n  at com.example.ApprovalService.getStatus(ApprovalService.java:42)'
  },
  'schema-sql': {
    label: '数据库 Schema',
    desc: '建表 DDL / migration 脚本 / init.sql 内容',
    placeholder: 'CREATE TABLE approval_detail (\n  id BIGINT PRIMARY KEY,\n  status TINYINT NOT NULL COMMENT "1=待审批 2=已审批 3=驳回"\n);'
  },
  'ticket-text': {
    label: '工单文本',
    desc: '从 Jira / 云效 / 内部工单复制的问题描述',
    placeholder: 'PLJI-2458 审批详情状态显示异常\n描述：审批列表页状态列显示数字而非中文...'
  },
  'page-url': {
    label: '页面 URL',
    desc: '出问题的页面地址',
    placeholder: 'https://your-app.example.com/approval/detail?id=123'
  },
  'api-response': {
    label: 'API 响应',
    desc: '直接粘贴接口返回的 JSON',
    placeholder: '{\n  "code": 200,\n  "data": {\n    "status": 1,\n    "approvalTime": "2024-01-01"\n  }\n}'
  },
  'repo-path': {
    label: '代码仓库路径',
    desc: '本地代码库的绝对路径',
    placeholder: '/Users/yourname/work/backend-service'
  },
  'screenshot-note': {
    label: '截图说明',
    desc: '用文字描述你看到的截图内容（Phase 3 才做 OCR）',
    placeholder: '截图显示：审批列表第三列标题"审批状态"，下方数据行均显示数字 1、2、3，无中文描述'
  },
  'free-text': {
    label: '其他文本',
    desc: '任何补充信息',
    placeholder: '补充说明：该问题从上周三版本发布后开始出现，之前正常...'
  }
};

export function EvidenceAddDialog({ open, onClose, onSubmit }: Props) {
  const [type, setType] = useState<EvidenceType>('curl');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const meta = TYPE_LABELS[type];

  const submit = async () => {
    setError(null);
    if (!content.trim()) { setError('内容不能为空'); return; }
    setSubmitting(true);
    try {
      await onSubmit(type, content);
      setContent('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-10 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded p-4 w-[580px] space-y-3">
        <div className="text-sm font-semibold">添加证据</div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-300">证据类型</span>
          <select
            className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
            value={type}
            onChange={e => { setType(e.target.value as EvidenceType); setContent(''); }}
          >
            {EVIDENCE_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t].label}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500">{meta.desc}</p>
        </label>

        <textarea
          rows={12}
          className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono"
          placeholder={meta.placeholder}
          value={content}
          onChange={e => setContent(e.target.value)}
        />

        {error && <div className="text-xs text-rose-400">⚠ {error}</div>}

        <div className="flex justify-end gap-2">
          <button
            className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
            onClick={onClose}
          >
            取消
          </button>
          <button
            disabled={submitting}
            className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            onClick={submit}
          >
            {submitting ? '添加中…' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
