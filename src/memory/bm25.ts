// Minimal BM25 for in-memory ranking of a small corpus (dozens to hundreds
// of memory entries per project). Zero dependencies.

const K1 = 1.5;
const B = 0.75;

/** Split into unicode-aware tokens; keep CJK bigrams as their own tokens so
 * that short Chinese queries can hit longer stored text. */
export function tokenize(text: string): string[] {
  const lowered = text.toLowerCase();
  const tokens: string[] = [];

  // ASCII / Latin word runs
  const wordRe = /[a-z0-9_][a-z0-9_.-]*/g;
  for (const m of lowered.match(wordRe) ?? []) {
    if (m.length >= 2) tokens.push(m);
  }

  // CJK unigrams + bigrams
  const cjkRe = /[一-鿿]/g;
  const cjkChars = lowered.match(cjkRe) ?? [];
  if (cjkChars.length > 0) {
    // Rebuild continuous CJK runs
    const runs = lowered.split(/[^一-鿿]+/).filter(r => r.length > 0);
    for (const run of runs) {
      if (run.length === 1) {
        tokens.push(run);
      } else {
        for (let i = 0; i < run.length - 1; i++) {
          tokens.push(run.slice(i, i + 2));
        }
      }
    }
  }

  return tokens;
}

export interface ScoredDoc<T> {
  doc: T;
  score: number;
}

interface Indexed<T> {
  doc: T;
  tokens: string[];
  length: number;
  tf: Map<string, number>;
}

/** Score all docs against the query and return non-zero hits sorted desc. */
export function bm25Rank<T>(
  docs: T[],
  getText: (d: T) => string,
  query: string,
  topK = 10
): ScoredDoc<T>[] {
  if (docs.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const indexed: Indexed<T>[] = docs.map(d => {
    const tokens = tokenize(getText(d));
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { doc: d, tokens, length: tokens.length, tf };
  });

  const avgLen = indexed.reduce((s, x) => s + x.length, 0) / indexed.length || 1;
  const N = indexed.length;

  // Document frequency
  const df = new Map<string, number>();
  const uniqQueryTerms = Array.from(new Set(queryTokens));
  for (const term of uniqQueryTerms) {
    let count = 0;
    for (const d of indexed) if (d.tf.has(term)) count++;
    df.set(term, count);
  }

  const scored: ScoredDoc<T>[] = indexed
    .map(d => {
      let score = 0;
      for (const term of uniqQueryTerms) {
        const f = d.tf.get(term) ?? 0;
        if (f === 0) continue;
        const dfi = df.get(term) ?? 0;
        const idf = Math.log(1 + (N - dfi + 0.5) / (dfi + 0.5));
        const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * d.length / avgLen));
        score += idf * norm;
      }
      return { doc: d.doc, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
