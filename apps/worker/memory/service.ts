// apps/worker/memory/service.ts
// Memory service. Source: spec/05-memory-system.md §5 (write), §6 (recall), §12 (API).
// Product principle: recall before generation. M1 stores episodes without embeddings and
// recalls by namespace + structured filters + recency (doc 05 §6.2 steps 1 & 3, §14 fallback);
// vector ranking (step 2) activates once an embedder is wired (M1+), backfilled per §10.
import type { Pool } from '@cos/db';

export interface RecallArgs {
  namespace: string;
  filters?: { format?: string; outcome?: string };
  k?: number;
}

export interface RecalledEpisode {
  summary: string;
  importance: number;
  payload: Record<string, unknown>;
}

export async function recall(db: Pool, args: RecallArgs): Promise<RecalledEpisode[]> {
  const { namespace, filters = {}, k = 5 } = args;
  const where: string[] = ['namespace = $1'];
  const params: unknown[] = [namespace];
  if (filters.format) {
    params.push(filters.format);
    where.push(`payload->>'format' = $${params.length}`);
  }
  if (filters.outcome) {
    params.push(filters.outcome);
    where.push(`outcome = $${params.length}`);
  }
  params.push(k);
  try {
    const { rows } = await db.query<{ summary: string; importance: string; payload: Record<string, unknown> }>(
      `select summary, importance, payload
         from memory_episodes
        where ${where.join(' and ')}
        order by importance desc nulls last, created_at desc
        limit $${params.length}`,
      params,
    );
    return rows.map((r) => ({ summary: r.summary, importance: Number(r.importance), payload: r.payload }));
  } catch {
    // Recall failure must never block a run (doc 05 §14): degrade to no memory.
    return [];
  }
}

/**
 * Recall active analytics recommendations for a department, to feed ideation (doc 13 §7 →
 * doc 12 §4.3). Returns compact "make more of X" lines ordered by confidence.
 */
export async function recallRecommendations(db: Pool, targetDept: string, k = 3): Promise<string[]> {
  try {
    const { rows } = await db.query<{ title: string; body: string }>(
      `select title, body from recommendations
        where status in ('proposed','accepted','implemented') and (target_dept = $1 or target_dept is null)
        order by (status='accepted') desc, confidence desc, created_at desc
        limit $2`,
      [targetDept, k],
    );
    return rows.map((r) => r.body || r.title);
  } catch {
    return [];
  }
}

export interface WriteEpisodeArgs {
  agentId: string;
  namespace: string;
  assetId?: string | null;
  taskId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
  outcome?: 'success' | 'failure' | 'neutral';
  importance?: number;
}

export async function writeEpisode(db: Pool, args: WriteEpisodeArgs): Promise<void> {
  // Importance from signal (doc 05 §5 rule 3); refined once scoring lands (M3).
  const importance =
    args.importance ?? (args.outcome === 'success' ? 0.7 : args.outcome === 'failure' ? 0.4 : 0.5);
  try {
    await db.query(
      `insert into memory_episodes (agent_id, namespace, asset_id, task_id, summary, payload, outcome, importance)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        args.agentId,
        args.namespace,
        args.assetId ?? null,
        args.taskId ?? null,
        args.summary,
        JSON.stringify(args.payload ?? {}),
        args.outcome ?? 'neutral',
        importance,
      ],
    );
  } catch {
    // Never block the pipeline on memory writes (doc 12 §4.18 On fail).
  }
}
