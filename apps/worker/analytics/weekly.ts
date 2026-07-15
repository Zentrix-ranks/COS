// apps/worker/analytics/weekly.ts
// Weekly report. Source: spec/13 §9 (what worked/didn't, top/bottom, KPI movement, 3
// prescriptive next actions, forecast + risks; every claim tied to metrics — no invented
// numbers), spec/04 §8.5 (weekly_reports). Composed by analytics_lead, delivered via notify.
import type { Pool } from '@cos/db';
import { notify } from '../notify/notify.js';

export interface WeeklyReportResult {
  reportId: string;
  summary: string;
}

export async function composeWeeklyReport(db: Pool): Promise<WeeklyReportResult> {
  const now = new Date();
  const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = now.toISOString().slice(0, 10);

  const kpis = (
    await db.query<{ reach: string; saves: string; follows: string; posts: string }>(
      `select coalesce(sum(reach),0) as reach, coalesce(sum(saves),0) as saves,
              coalesce(sum(follows),0) as follows, count(*) as posts
         from metrics where "window"='lifetime'`,
    )
  ).rows[0]!;

  const top = (
    await db.query<{ title: string | null; composite: string; label: string | null }>(
      `select distinct on (s.asset_id) a.title, s.composite::text as composite, s.label
         from scores s join assets a on a.id=s.asset_id
        order by s.asset_id, s.scored_at desc`,
    )
  ).rows
    .sort((a, b) => Number(b.composite) - Number(a.composite))
    .slice(0, 3);

  const recs = (
    await db.query<{ body: string }>(
      `select body from recommendations where status in ('proposed','accepted') order by confidence desc limit 3`,
    )
  ).rows.map((r) => r.body);

  const forecast = (
    await db.query<{ metric: string; horizon: string; point: string }>(
      `select distinct on (metric,horizon) metric, horizon, point::text as point
         from forecasts order by metric, horizon, created_at desc`,
    )
  ).rows;

  const highlights = top.map((t) => `${t.title ?? '(untitled)'} — score ${Number(t.composite).toFixed(3)}${t.label === 'winner' ? ' ★' : ''}`);
  const summary =
    `Week ${periodStart}→${periodEnd}: ${kpis.posts} posts, reach ${Number(kpis.reach).toLocaleString()}, ` +
    `saves ${kpis.saves}, follows ${kpis.follows}. ${recs.length} prescriptive action(s) queued.`;

  const { rows } = await db.query<{ id: string }>(
    `insert into weekly_reports (period_start, period_end, summary, highlights, recommendations, metrics, delivered_channels)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (period_start, period_end) do update set summary=excluded.summary,
       highlights=excluded.highlights, recommendations=excluded.recommendations,
       metrics=excluded.metrics, delivered_channels=excluded.delivered_channels
     returning id`,
    [
      periodStart,
      periodEnd,
      summary,
      JSON.stringify(highlights),
      JSON.stringify(recs),
      JSON.stringify({ reach: Number(kpis.reach), saves: Number(kpis.saves), follows: Number(kpis.follows), posts: Number(kpis.posts), forecast }),
      ['in_app', 'slack'],
    ],
  );
  const reportId = rows[0]!.id;

  await notify(db, {
    severity: 'info',
    title: 'Weekly report ready',
    body: summary,
    channels: ['in_app', 'slack'],
    data: { report_id: reportId, highlights, recommendations: recs },
  });

  return { reportId, summary };
}
