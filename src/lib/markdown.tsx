'use client';
import type { ReactNode } from 'react';

// Lightweight markdown renderer for streamed LLM output. Supports:
// - fenced code blocks ```lang\n...\n```
// - headings # ## ###
// - inline code `x`
// - bold **x**
// - unordered lists `- ` and ordered `1. `
// - paragraphs
// Preserves partial trailing content so streaming looks natural.

type Block =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string };

function tokenize(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind: 'code', lang, text: body.join('\n') });
      continue;
    }
    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }
    // list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    // paragraph: consume until blank line or block start
    if (line.trim() === '') {
      i++;
      continue;
    }
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== ''
      && !/^```/.test(lines[i]) && !/^#{1,3}\s+/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }
  return blocks;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(<strong key={`${keyBase}-b-${idx++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={`${keyBase}-c-${idx++}`} className="bg-slate-800 rounded px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = tokenize(source);
  return (
    <div className="prose-invert text-sm leading-relaxed space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === 'code') {
          return (
            <pre key={i} className="bg-slate-950/80 border border-slate-800 rounded p-2 text-[12px] overflow-x-auto">
              {b.lang && <div className="text-[10px] text-slate-500 mb-1">{b.lang}</div>}
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.kind === 'h') {
          const cls = b.level === 1 ? 'text-lg font-semibold mt-3' : b.level === 2 ? 'text-base font-semibold mt-3 text-blue-300' : 'text-sm font-semibold mt-2 text-slate-200';
          return <div key={i} className={cls}>{renderInline(b.text, `h${i}`)}</div>;
        }
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.items.map((t, j) => <li key={j}>{renderInline(t, `ul${i}-${j}`)}</li>)}
            </ul>
          );
        }
        if (b.kind === 'ol') {
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {b.items.map((t, j) => <li key={j}>{renderInline(t, `ol${i}-${j}`)}</li>)}
            </ol>
          );
        }
        return <p key={i} className="text-slate-200">{renderInline(b.text, `p${i}`)}</p>;
      })}
    </div>
  );
}
