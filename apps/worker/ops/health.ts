// apps/worker/ops/health.ts
// Health & observability. Source: spec/02 §8.2 (metrics/alerting), spec/13 §10 (IG health
// indicator), spec/04 §11 (health_snapshots), spec/14 §9. Writes a health snapshot the Mission
// Control pill reads (doc 07 §5.1) and alerts the operator when not green.
import type { Pool } from '@cos/db';
import { getDailyBudgetUsd, getDailySpendUsd } from './governance.js';
import { notify } from '../notify/notify.js';

export interface HealthSnapshot {
  overall: 'green' | 'amber' | 'red';
  queue_depth: number;
  run_success_rate: number;
  tool_outages: number;
  budget_burn_usd: number;
  ig_health: string;
}

function igHealth(avgReach: number, samples: number): string {
  if (samples === 0) return 'Unknown';
  if (avgReach >= 4000) return 'Excellent';
  if (avgReach >= 2000) return 'Good';
  if (avgReach >= 800) return 'Fair';
  return 'Poor';
}

export async function computeAndWriteHealth(db: Pool, queueDepth = 0): Promise<HealthSnapshot> {
  const outages = Number(
    (await db.query<{ c: string }>(`select count(*) c from tool_status where breaker_open`)).rows[0]!.c,
  );
  const runAgg = (
    await db.query<{ done: string; failed: string }>(
      `select count(*) filter (where status='completed') done, count(*) filter (where status='failed') failed
         from runs where started_at > now() - interval '24 hours'`,
    )
  ).rows[0]!;
  const total = Number(runAgg.done) + Number(runAgg.failed);
  const successRate = total > 0 ? Number(runAgg.done) / total : 1;
  const spend = await getDailySpendUsd(db);
  const cap = await getDailyBudgetUsd(db);
  const reachAgg = (
    await db.query<{ avg: string | null; n: string }>(
      `select avg(reach) avg, count(*) n from metrics where "window"='lifetime' and captured_at > now() - interval '7 days'`,
    )
  ).rows[0]!;
  const ig = igHealth(Number(reachAgg.avg ?? 0), Number(reachAgg.n));

  let overall: HealthSnapshot['overall'] = 'green';
  if (outages > 0 || (cap > 0 && spend >= cap)) overall = 'red';
  else if (successRate < 0.9 || (cap > 0 && spend >= cap * 0.8)) overall = 'amber';

  const snap: HealthSnapshot = {
    overall,
    queue_depth: queueDepth,
    run_success_rate: Math.round(successRate * 10000) / 100,
    tool_outages: outages,
    budget_burn_usd: Math.round(spend * 100) / 100,
    ig_health: ig,
  };

  await db.query(
    `insert into health_snapshots (overall, queue_depth, run_success_rate, tool_outages, budget_burn_usd, ig_health, details)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [snap.overall, snap.queue_depth, snap.run_success_rate, snap.tool_outages, snap.budget_burn_usd, snap.ig_health, JSON.stringify({ cap })],
  );

  if (overall !== 'green') {
    await notify(db, {
      severity: overall === 'red' ? 'critical' : 'warning',
      title: `System health ${overall.toUpperCase()}`,
      body: `outages=${outages}, run_success=${snap.run_success_rate}%, spend=$${snap.budget_burn_usd}/${cap}, IG=${ig}.`,
      channels: ['in_app', 'slack'],
    });
  }
  return snap;
}
