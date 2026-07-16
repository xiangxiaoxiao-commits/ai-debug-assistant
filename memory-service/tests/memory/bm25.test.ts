import { describe, it, expect } from 'vitest';
import { tokenize, bm25Rank } from '@/memory/bm25';

describe('tokenize', () => {
  it('lowercases ASCII words', () => {
    expect(tokenize('Hello World')).toContain('hello');
    expect(tokenize('Hello World')).toContain('world');
  });

  it('produces CJK bigrams for continuous runs', () => {
    const toks = tokenize('审批模块');
    expect(toks).toContain('审批');
    expect(toks).toContain('批模');
    expect(toks).toContain('模块');
  });

  it('mixes ASCII + CJK', () => {
    const toks = tokenize('订单 DTO 转换');
    expect(toks).toContain('订单');
    expect(toks).toContain('dto');
    expect(toks).toContain('转换');
  });
});

describe('bm25Rank', () => {
  const docs = [
    { id: '1', text: '审批模块字段显示为数字，应显示中文' },
    { id: '2', text: '订单接口偶发 500 错误' },
    { id: '3', text: '登录页面报 CSRF 错误' },
    { id: '4', text: '审批详情页面 DTO 转换' }
  ];

  it('finds Chinese matches', () => {
    const hits = bm25Rank(docs, d => d.text, '审批显示', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc.id).toBe('1');   // most direct match
  });

  it('empty query returns nothing', () => {
    expect(bm25Rank(docs, d => d.text, '', 3)).toEqual([]);
  });

  it('empty corpus returns nothing', () => {
    expect(bm25Rank([], (d: { text: string }) => d.text, 'x', 3)).toEqual([]);
  });

  it('respects topK', () => {
    const hits = bm25Rank(docs, d => d.text, '审批 订单 登录', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});
