import type { ModelConfig } from '@/domain/model-config';
import type { Playbook, PlaybookStep } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `你根据用户消息和 AI 回复，判断 playbook 中哪些步骤发生了状态变化。
只输出有变化的步骤，不要输出未变化的步骤。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "updates": [
    { "stepId": "uuid", "status": "todo|doing|done|skipped", "notes": "可选备注" }
  ]
}`;

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type StepStatus = PlaybookStep['status'];
const VALID_STATUSES: StepStatus[] = ['todo', 'doing', 'done', 'skipped'];

export async function updatePlaybookProgress(
  cfg: ModelConfig,
  input: {
    playbook: Playbook;
    latestUserMessage: string;
    latestAssistantReply: string;
  }
): Promise<Playbook | null> {
  const { playbook, latestUserMessage, latestAssistantReply } = input;

  const stepList = playbook.steps
    .map(s => `- id: ${s.id}, order: ${s.order}, title: "${s.title}", status: ${s.status}`)
    .join('\n');

  const userPrompt = `## Playbook 步骤\n${stepList}\n\n## 最新用户消息\n${latestUserMessage}\n\n## AI 回复摘要\n${latestAssistantReply.slice(0, 1000)}`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 256,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.updates)) return null;

    const updates = parsed.updates as { stepId?: unknown; status?: unknown; notes?: unknown }[];
    if (updates.length === 0) return null;

    const now = new Date().toISOString();
    const updatedSteps = playbook.steps.map(step => {
      const patch = updates.find(u => u.stepId === step.id);
      if (!patch) return step;
      const newStatus = VALID_STATUSES.includes(patch.status as StepStatus)
        ? (patch.status as StepStatus)
        : step.status;
      return {
        ...step,
        status: newStatus,
        notes: typeof patch.notes === 'string' ? patch.notes : step.notes,
        updatedAt: now,
        updatedBy: 'llm' as const
      };
    });

    return { ...playbook, steps: updatedSteps, updatedAt: now };
  } catch {
    return null;
  }
}
