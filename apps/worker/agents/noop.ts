// apps/worker/agents/noop.ts
// The M0 no-op agent. Source: spec/16 §6 (M0 DoD: "a no-op run appears live on the dashboard").
// Proves the runtime seam end-to-end: create a run, record a run_step, publish realtime status,
// complete the run — without calling any external tool. Real agent executors (recall → prompt →
// tool-calls → output → memory write, doc 03 §4.2) follow in M1.
import type { Pool } from '@cos/db';
import { REALTIME_CHANNEL } from '@cos/shared';
import type Redis from 'ioredis';

export interface NoopResult {
  runId: string;
}

export async function runNoopAgent(db: Pool, pub: Redis, taskId?: string): Promise<NoopResult> {
  const client = await db.connect();
  try {
    // 1. Open a run (doc 04 §5.3).
    const { rows } = await client.query<{ id: string }>(
      `insert into runs (graph, task_id, status, current_node)
       values ('noop', $1, 'running', 'noop') returning id`,
      [taskId ?? null],
    );
    const runId = rows[0]!.id;
    await publishStatus(pub, { runId, node: 'noop', status: 'running' });

    // 2. Record a single run_step (doc 04 §5.4) — this is what the Run Inspector reads.
    await client.query(
      `insert into run_steps (run_id, seq, node, agent_id, status, reasoning_summary, finished_at)
       values ($1, 1, 'noop', null, 'passed', 'no-op: proved the enqueue->run->step->realtime loop', now())`,
      [runId],
    );

    // 3. Close the run.
    await client.query(
      `update runs set status='completed', current_node='noop', steps_used=1, finished_at=now() where id=$1`,
      [runId],
    );
    await publishStatus(pub, { runId, node: 'noop', status: 'completed' });

    return { runId };
  } finally {
    client.release();
  }
}

function publishStatus(
  pub: Redis,
  evt: { runId: string; node: string; status: string },
): Promise<number> {
  // Realtime path (doc 02 §5): worker emits → Redis pub/sub → control-plane hub → SSE → browser.
  return pub.publish(REALTIME_CHANNEL, JSON.stringify({ kind: 'run.status', ...evt, at: Date.now() }));
}
