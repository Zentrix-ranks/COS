// apps/web/server/operations.ts
// Operations tab data. Source: spec/07 §6.4 (tool status matrix, health, cost dashboard, logs),
// spec/02 §8 (observability/cost), spec/14 §9 (automation observability).
import 'server-only';
import { getPool } from './db.js';

export interface ToolStatusRow {
  tool: string;
  healthy: boolean;
  breaker_open: boolean;
  last_ok_at: string | null;
  updated_at: string;
}

export interface HealthRow {
  overall: string;
  queue_depth: number | null;
  run_success_rate: number | null;
  tool_outages: number | null;
  budget_burn_usd: number | null;
  ig_health: string | null;
  created_at: string;
}

export interface CostRow {
  agent_id: string | null;
  usd: number;
  calls: number;
}

export interface DlqRow {
  target: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface OperationsData {
  tools: ToolStatusRow[];
  health: HealthRow | null;
  costToday: CostRow[];
  costTotalToday: number;
  dlq: DlqRow[];
  paused: boolean;
}

export async function getOperations(): Promise<OperationsData | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const tools = (
      await p.query<ToolStatusRow>(
        `select tool, healthy, breaker_open, last_ok_at, updated_at from tool_status order by tool`,
      )
    ).rows;
    const health = (
      await p.query<HealthRow>(
        `select overall, queue_depth, run_success_rate::float8 as run_success_rate, tool_outages,
                budget_burn_usd::float8 as budget_burn_usd, ig_health, created_at
           from health_snapshots order by created_at desc limit 1`,
      )
    ).rows[0] ?? null;
    const costToday = (
      await p.query<CostRow>(
        `select agent_id, sum(usd)::float8 as usd, count(*)::int as calls
           from cost_ledger where created_at::date = now()::date
          group by agent_id order by usd desc limit 12`,
      )
    ).rows;
    const costTotalToday = costToday.reduce((a, c) => a + Number(c.usd), 0);
    const dlq = (
      await p.query<DlqRow>(
        `select target, meta, created_at from audit_log where action='dlq' order by created_at desc limit 10`,
      )
    ).rows;
    const pausedRow = (await p.query<{ value: unknown }>(`select value from system_settings where key='operation.paused'`)).rows[0];
    const paused = pausedRow?.value === true || (typeof pausedRow?.value === 'object' && (pausedRow?.value as { paused?: boolean })?.paused === true);
    return { tools, health, costToday, costTotalToday: Math.round(costTotalToday * 1e5) / 1e5, dlq, paused };
  } catch {
    return null;
  }
}
