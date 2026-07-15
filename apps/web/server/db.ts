// apps/web/server/db.ts
// Control-plane read layer. Source: spec/04-database-schema.md §12/§13, spec/07 §5.1.
// Every query runs under the caller's app role (request.jwt.role) inside a transaction, so RLS
// policies (which use auth.role()) enforce per request over the direct pool — the direct-pool
// equivalent of what Supabase's PostgREST does automatically (spec/02 §8.1, spec/04 §12).
// Reads are graceful — if no DB is configured/reachable, callers fall back to an offline view.
import 'server-only';
import { cache } from 'react';
import pg from 'pg';
import { roleForRequest } from './auth.js';

let pool: pg.Pool | null = null;
let poolFailed = false;

export function getPool(): pg.Pool | null {
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

/** The app role for this request, resolved once per render (React cache). */
export const getRequestRole = cache(async (): Promise<string> => roleForRequest());

/** Run a query under the request's role so RLS applies. Returns null when the DB is unavailable. */
export async function queryAsRole<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[] | null> {
  const p = getPool();
  if (!p) return null;
  const role = await getRequestRole();
  const client = await p.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.role', $1, true)`, [role]);
    const res = await client.query<T>(sql, params);
    await client.query('commit');
    return res.rows;
  } catch {
    await client.query('rollback').catch(() => undefined);
    // DB unreachable / not migrated / RLS-denied → let the caller render the offline/empty state.
    return null;
  } finally {
    client.release();
  }
}

/** Run a multi-statement unit of work under the request's role (RLS applies). */
export async function withRequestRoleClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  const role = await getRequestRole();
  const client = await p.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.role', $1, true)`, [role]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// Back-compat alias: existing Mission Control readers call query(); now role-scoped.
const query = queryAsRole;

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
