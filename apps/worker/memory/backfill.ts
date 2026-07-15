// apps/worker/memory/backfill.ts
// Embedding backfill. Source: spec/05 §10 (embeddings backfilled in batches), §14 (rows stored
// without an embedding are excluded from vector recall until backfilled). Embeds any
// memory_episodes / kb_chunks with a null embedding.
import type { Pool } from '@cos/db';
import { getEmbedder, toVectorLiteral } from '../model/embeddings.js';

export interface BackfillResult {
  episodes: number;
  chunks: number;
}

export async function backfillEmbeddings(db: Pool, batch = 500): Promise<BackfillResult> {
  const embedder = getEmbedder();

  let episodes = 0;
  const eps = await db.query<{ id: string; summary: string; payload: Record<string, unknown> }>(
    `select id, summary, payload from memory_episodes where embedding is null limit $1`,
    [batch],
  );
  for (const e of eps.rows) {
    const vec = await embedder.embed(`${e.summary} ${JSON.stringify(e.payload ?? {})}`);
    await db.query(`update memory_episodes set embedding=$1::vector where id=$2`, [toVectorLiteral(vec), e.id]);
    episodes++;
  }

  let chunks = 0;
  const ch = await db.query<{ id: string; content: string }>(
    `select id, content from kb_chunks where embedding is null limit $1`,
    [batch],
  );
  for (const c of ch.rows) {
    const vec = await embedder.embed(c.content);
    await db.query(`update kb_chunks set embedding=$1::vector where id=$2`, [toVectorLiteral(vec), c.id]);
    chunks++;
  }

  return { episodes, chunks };
}
