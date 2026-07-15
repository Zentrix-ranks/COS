// apps/web/server/runs.ts
// Runs & Run Inspector data. Source: spec/07 §8 (runs list + run inspector: run_steps timeline
// with agent, input, reasoning, tool calls, output, and where an interrupt occurred), spec/06 §11.
import 'server-only';
import { getPool } from './db.js';

export interface RunRow {
  id: string;
  graph: string;
  status: string;
  current_node: string | null;
  cost_usd: number;
  steps_used: number;
  started_at: string;
  finished_at: string | null;
}

export async function listRuns(): Promise<RunRow[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<RunRow>(
      `select id, graph, status, current_node, cost_usd::float8 as cost_usd, steps_used,
              started_at, finished_at
         from runs order by started_at desc limit 30`,
    );
    return rows;
  } catch {
    return null;
  }
}

export interface RunStepRow {
  seq: number;
  node: string;
  agent_id: string | null;
  status: string;
  reasoning_summary: string | null;
  input: { promptId?: string; recalled?: string[] } | null;
  output: Record<string, unknown> | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

export interface ToolCallRow {
  tool: string;
  ok: boolean | null;
  latency_ms: number | null;
  cost_usd: number;
}

export interface RunDetail {
  run: RunRow;
  steps: RunStepRow[];
  toolCalls: ToolCallRow[];
  interruptedAt: string | null;
}

export async function getRunDetail(id: string): Promise<RunDetail | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const runRes = await p.query<RunRow>(
      `select id, graph, status, current_node, cost_usd::float8 as cost_usd, steps_used, started_at, finished_at
         from runs where id=$1`,
      [id],
    );
    const run = runRes.rows[0];
    if (!run) return null;
    const steps = (
      await p.query<RunStepRow>(
        `select seq, node, agent_id, status, reasoning_summary, input, output,
                cost_usd::float8 as cost_usd, tokens_in, tokens_out
           from run_steps where run_id=$1 order by seq asc`,
        [id],
      )
    ).rows;
    const toolCalls = (
      await p.query<ToolCallRow>(
        `select tc.tool, tc.ok, tc.latency_ms, tc.cost_usd::float8 as cost_usd
           from tool_calls tc join run_steps rs on rs.id = tc.run_step_id
          where rs.run_id=$1 order by tc.created_at asc`,
        [id],
      )
    ).rows;
    // Where an interrupt occurred (HITL): the run paused at its current_node (doc 06 §6).
    const interruptedAt = run.status === 'paused' ? run.current_node : null;
    return { run, steps, toolCalls, interruptedAt };
  } catch {
    return null;
  }
}
