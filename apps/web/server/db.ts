// apps/web/server/db.ts
// Control-plane read layer. Source: spec/04-database-schema.md §13 (views) + spec/07 §5.1
// (Mission Control data map). The control plane connects with the RLS-enforced role
// (DATABASE_URL); reads are graceful — if no DB is configured/reachable, callers fall back
// to an empty/placeholder view so the shell still renders (doc 07 §5.3 states).
import 'server-only';
import pg from 'pg';

let pool: pg.Pool | null = null;
let poolFailed = false;

function getPool(): pg.Pool | null {
  if (poolFailed) return null;
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    poolFailed = true;
    return null;
  }
  pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 2000 });
  pool.on('error', () => {
    /* swallow idle-client errors; next query re-evaluates health */
  });
  return pool;
}

async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query<T>(sql, params);
    return res.rows;
  } catch {
    // DB unreachable / not migrated yet → let the caller render the offline state.
    return null;
  }
}

export interface TodayProgress {
  completed: number;
  total: number;
  pending_reviews: number;
  scheduled: number;
}

export async function getTodayProgress(): Promise<TodayProgress | null> {
  const rows = await query<{
    completed: string;
    total: string;
    pending_reviews: string;
    scheduled: string;
  }>('select completed, total, pending_reviews, scheduled from v_today_progress');
  if (!rows || rows.length === 0) return null;
  const r = rows[0]!;
  return {
    completed: Number(r.completed),
    total: Number(r.total),
    pending_reviews: Number(r.pending_reviews),
    scheduled: Number(r.scheduled),
  };
}

export interface RunningAgent {
  graph: string;
  current_node: string | null;
  agent_id: string | null;
  agent_name: string | null;
}

export async function getRunningAgents(): Promise<RunningAgent[] | null> {
  // v_running_agents (doc 04 §13) joined to agents for a human-readable name.
  return query<RunningAgent>(
    `select va.graph, va.current_node, va.agent_id, a.name as agent_name
     from v_running_agents va
     left join agents a on a.id = va.agent_id
     order by va.updated_at desc
     limit 12`,
  );
}

export interface QueueTask {
  id: string;
  title: string;
  status: string;
}

export async function getTaskQueue(): Promise<QueueTask[] | null> {
  return query<QueueTask>(
    `select id, title, status from tasks
     order by (status = 'done') asc, priority asc, created_at desc
     limit 12`,
  );
}

export interface NotificationRow {
  id: string;
  title: string;
  severity: string;
}

export async function getNotifications(): Promise<NotificationRow[] | null> {
  return query<NotificationRow>(
    `select id, title, severity from notifications
     where read_at is null
     order by created_at desc
     limit 8`,
  );
}

export interface Health {
  overall: string;
  ig_health: string | null;
}

export async function getHealth(): Promise<Health | null> {
  const rows = await query<Health>(
    'select overall, ig_health from health_snapshots order by created_at desc limit 1',
  );
  if (!rows || rows.length === 0) return null;
  return rows[0]!;
}
