'use client';
import { Markdown } from '@/lib/markdown';

interface Props {
  source: string;
}

interface Section {
  title: string;
  body: string;
  style: SectionStyle;
}

interface SectionStyle {
  icon: string;
  label: string;               // 用户看到的短标题（可能跟 title 不同）
  border: string;
  accent: string;
  bg: string;
}

// Recognized headings → structured styling.  Anything not in this map uses
// FALLBACK so custom markdown from the LLM still renders neatly.
const SECTION_STYLES: Record<string, SectionStyle> = {
  '一句话结论': {
    icon: '⚡', label: '一句话结论',
    border: 'border-blue-800/60', accent: 'text-blue-300', bg: 'bg-blue-950/30'
  },
  '已确认的事实': {
    icon: '✓', label: '已确认的事实',
    border: 'border-emerald-800/60', accent: 'text-emerald-300', bg: 'bg-emerald-950/20'
  },
  '推断的根因': {
    icon: '🔍', label: '根因分析',
    border: 'border-amber-800/60', accent: 'text-amber-300', bg: 'bg-amber-950/20'
  },
  '根因分析': {
    icon: '🔍', label: '根因分析',
    border: 'border-amber-800/60', accent: 'text-amber-300', bg: 'bg-amber-950/20'
  },
  '建议的验证步骤': {
    icon: '🧪', label: '验证链路',
    border: 'border-violet-800/60', accent: 'text-violet-300', bg: 'bg-violet-950/20'
  },
  '验证步骤': {
    icon: '🧪', label: '验证链路',
    border: 'border-violet-800/60', accent: 'text-violet-300', bg: 'bg-violet-950/20'
  },
  '建议的修复方案': {
    icon: '🔧', label: '解决方案',
    border: 'border-teal-800/60', accent: 'text-teal-300', bg: 'bg-teal-950/20'
  },
  '修复方案': {
    icon: '🔧', label: '解决方案',
    border: 'border-teal-800/60', accent: 'text-teal-300', bg: 'bg-teal-950/20'
  },
  '还需要什么信息': {
    icon: '?', label: '还需要',
    border: 'border-slate-700', accent: 'text-slate-300', bg: 'bg-slate-800/40'
  }
};

const FALLBACK: SectionStyle = {
  icon: '·', label: '',
  border: 'border-slate-800', accent: 'text-slate-300', bg: 'bg-slate-900/40'
};

function styleFor(title: string): SectionStyle {
  const cleaned = title.trim().replace(/[（(].*?[）)]$/, '').trim();
  // Exact match first, then substring
  if (SECTION_STYLES[cleaned]) return SECTION_STYLES[cleaned];
  for (const key of Object.keys(SECTION_STYLES)) {
    if (cleaned.includes(key) || key.includes(cleaned)) return SECTION_STYLES[key];
  }
  return { ...FALLBACK, label: cleaned || FALLBACK.label };
}

function splitSections(source: string): Section[] {
  const lines = source.split('\n');
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let preambleLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) return;
    const body = currentLines.join('\n').trim();
    if (body || currentTitle) {
      sections.push({ title: currentTitle, body, style: styleFor(currentTitle) });
    }
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      currentTitle = m[1].trim();
    } else if (currentTitle === null) {
      preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // If no ## headings were found at all, treat the whole thing as one card
  if (sections.length === 0) {
    const body = source.trim();
    if (body) sections.push({ title: '', body, style: FALLBACK });
    return sections;
  }

  // Any pre-heading preamble becomes an untitled card at the top
  const preamble = preambleLines.join('\n').trim();
  if (preamble) {
    sections.unshift({ title: '', body: preamble, style: FALLBACK });
  }

  return sections;
}

export function SectionedReport({ source }: Props) {
  const sections = splitSections(source);
  if (sections.length === 0) return null;

  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div
          key={i}
          className={`rounded-lg border ${s.style.border} ${s.style.bg} px-3 py-2`}
        >
          {s.title && (
            <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${s.style.accent}`}>
              <span>{s.style.icon}</span>
              <span>{s.style.label || s.title}</span>
            </div>
          )}
          <div className="text-sm">
            <Markdown source={s.body} />
          </div>
        </div>
      ))}
    </div>
  );
}
