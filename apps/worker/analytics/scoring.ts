// apps/worker/analytics/scoring.ts
// Composite scoring. Source: spec/13 §4 (weights, baseline, percentile, labels, min-sample gate),
// spec/04 §8.2 (scores). content_scorer computes one composite score per published asset from
// its metrics, normalized per format so small-reach posts aren't unfairly penalized.
import type { Pool } from '@cos/db';

// Default weights (doc 13 §4). Tunable per objective via system_settings later.
const W = {
  saves: 0.3,
  shares: 0.25,
  retention: 0.2, // watch_time proxy; 0 for carousels (no watch)
  reach: 0.1,
  profile_visits: 0.08,
  follows: 0.05,
  comments: 0.02,
} as const;

const MIN_REACH = 500; // min-sample gate (doc 13 §4)

interface AssetMetric {
  asset_id: string;
  format: string;
  reach: number;
  saves: number;
  shares: number;
  comments: number;
  profile_visits: number;
  follows: number;
  watch_time_s: number;
}

export interface ScoreResult {
  scored: number;
  winners: number;
  losers: number;
}

export async function scoreAssets(db: Pool): Promise<ScoreResult> {
  // Latest lifetime metric per published asset.
  const { rows } = await db.query<AssetMetric>(
    `select distinct on (m.asset_id)
        m.asset_id, a.type as format,
        coalesce(m.reach,0) as reach, coalesce(m.saves,0) as saves, coalesce(m.shares,0) as shares,
        coalesce(m.comments,0) as comments, coalesce(m.profile_visits,0) as profile_visits,
        coalesce(m.follows,0) as follows, coalesce(m.watch_time_s,0) as watch_time_s
       from metrics m join assets a on a.id = m.asset_id
      where m."window" = 'lifetime'
      order by m.asset_id, m.captured_at desc`,
  );
  if (rows.length === 0) return { scored: 0, winners: 0, losers: 0 };

  // Reach range per format for min-max normalization of the reach term.
  const reachByFormat = new Map<string, number[]>();
  for (const r of rows) {
    const arr = reachByFormat.get(r.format) ?? [];
    arr.push(r.reach);
    reachByFormat.set(r.format, arr);
  }
  const reachRange = new Map<string, { min: number; max: number }>();
  for (const [fmt, arr] of reachByFormat) reachRange.set(fmt, { min: Math.min(...arr), max: Math.max(...arr) });

  const composites: Array<{ asset_id: string; format: string; composite: number; components: Record<string, number>; sample_ok: boolean }> = [];
  for (const r of rows) {
    const rate = (x: number) => (r.reach > 0 ? x / r.reach : 0);
    const range = reachRange.get(r.format)!;
    const reachNorm = range.max > range.min ? (r.reach - range.min) / (range.max - range.min) : 0.5;
    const retention = r.watch_time_s > 0 && r.reach > 0 ? Math.min(1, r.watch_time_s / (r.reach * 15)) : 0;
    const components = {
      saves: W.saves * rate(r.saves),
      shares: W.shares * rate(r.shares),
      retention: W.retention * retention,
      reach: W.reach * reachNorm,
      profile_visits: W.profile_visits * rate(r.profile_visits),
      follows: W.follows * rate(r.follows),
      comments: W.comments * rate(r.comments),
    };
    const composite = Object.values(components).reduce((a, b) => a + b, 0);
    composites.push({ asset_id: r.asset_id, format: r.format, composite, components, sample_ok: r.reach >= MIN_REACH });
  }

  // Percentile + label within format (top/bottom quartile → winner/loser), doc 13 §4.
  const byFormat = new Map<string, typeof composites>();
  for (const c of composites) {
    const arr = byFormat.get(c.format) ?? [];
    arr.push(c);
    byFormat.set(c.format, arr);
  }

  let winners = 0;
  let losers = 0;
  for (const [, arr] of byFormat) {
    const sorted = [...arr].sort((a, b) => a.composite - b.composite);
    const median = sorted[Math.floor(sorted.length / 2)]!.composite;
    for (const c of arr) {
      const rank = sorted.filter((x) => x.composite <= c.composite).length;
      const percentile = (rank / sorted.length) * 100;
      let label = 'neutral';
      if (c.sample_ok && percentile >= 75) {
        label = 'winner';
        winners++;
      } else if (c.sample_ok && percentile <= 25) {
        label = 'loser';
        losers++;
      }
      await db.query(
        `insert into scores (asset_id, composite, components, baseline, percentile, label, sample_ok)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [c.asset_id, round(c.composite), JSON.stringify(mapRound(c.components)), round(median), round(percentile, 2), label, c.sample_ok],
      );
    }
  }

  return { scored: composites.length, winners, losers };
}

function round(x: number, dp = 3): number {
  return Math.round(x * 10 ** dp) / 10 ** dp;
}
function mapRound(m: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v, 4)]));
}
