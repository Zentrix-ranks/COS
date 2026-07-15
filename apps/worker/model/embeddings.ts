// apps/worker/model/embeddings.ts
// Embeddings for memory + KB vector recall. Source: spec/05 §10 (default text-embedding-3-small,
// 1536-dim, cached; configurable), spec/04 §1.1 (vector(1536)).
//
// The default MockEmbedder is a deterministic hashing vectorizer (feature hashing of tokens →
// L2-normalized 1536-dim vector): it needs no API key yet yields genuine lexical similarity, so
// vector recall is demonstrable locally. The OpenAIEmbedder (COS_EMBEDDER=openai + key) swaps in
// real embeddings via the same interface.

export const EMBED_DIM = 1536;

export interface Embedder {
  readonly name: string;
  embed(text: string): Promise<number[]>;
}

/** Deterministic hashing vectorizer — real lexical similarity, no external calls. */
export class MockEmbedder implements Embedder {
  readonly name = 'mock-hash';

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(EMBED_DIM).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const tok of tokens) {
      const h = fnv1a(tok) % EMBED_DIM;
      const sign = (fnv1a('s:' + tok) & 1) === 0 ? 1 : -1;
      v[h] = (v[h] ?? 0) + sign;
    }
    // L2 normalize so cosine distance is meaningful.
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

/** Real embeddings via OpenAI text-embedding-3-small (doc 05 §10). */
export class OpenAIEmbedder implements Embedder {
  readonly name = 'openai:text-embedding-3-small';
  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: EMBED_DIM }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data[0]!.embedding;
  }
}

/** Format a vector for a pgvector bind parameter (cast `$n::vector` in SQL). */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

let cached: Embedder | null = null;
export function getEmbedder(): Embedder {
  if (cached) return cached;
  const which = process.env.COS_EMBEDDER ?? 'mock';
  if (which === 'openai' && process.env.OPENAI_API_KEY) {
    cached = new OpenAIEmbedder(process.env.OPENAI_API_KEY);
  } else {
    cached = new MockEmbedder();
  }
  return cached;
}

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
