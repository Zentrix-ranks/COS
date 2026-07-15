// apps/worker/analytics/learning.ts
// The learning loop. Source: spec/13 — clustering (§5), pattern mining + confidence gate (§6),
// recommendation engine (§7), forecasting (§8); spec/05 §5.4 (promote episodes → semantic).
// Prescriptive, not descriptive: turn measured performance into "make more of X" guidance and
// promote what worked into memory so future ideation reuses it.
import type { Pool } from '@cos/db';
import { scoreAssets, type ScoreResult } from './scoring.js';

const MIN_SUPPORT = 2; // minimum cluster size to mine (doc 13 §6)
const MIN_LIFT = 0.05; // 5% over baseline to be a "winning pattern"

interface ScoredAsset {
  asset_id: string;
  composite: number;
  format: string;
  cta_kind: string | null;
  slides: number;
  hook: string | null;
}

export interface LearnResult extends ScoreResult {
  clusters: number;
  recommendations: number;
  forecasts: number;
  promoted: number;
  measured: number;
}

function hookTag(hook: string | null): string {
  const h = (hook ?? '').toLowerCase();
  if (/stop|truth|wrong|myth|nobody|most (traders|people)/.test(h)) return 'contrarian';
  if (/\?$|\bwhy\b|\bhow\b/.test(h)) return 'question';
  return 'direct';
}
function lengthBucket(slides: number): string {
  if (slides <= 5) return '<=5 slides';
  if (slides <= 8) return '6-8 slides';
  return '9+ slides';
}

interface Cluster {
  id: string;
  dimension: string;
  label: string;
  size: number;
  avg: number;
  confidence: number;
  members: string[];
}

export async function runLearning(db: Pool): Promise<LearnResult> {
  const scoreRes = await scoreAssets(db);

  // Load the latest score per sample-ok asset with clustering attributes.
  const { rows } = await db.query<ScoredAsset>(
    `select distinct on (s.asset_id)
        s.asset_id, s.composite::float8 as composite, a.type as format,
        a.cta->>'kind' as cta_kind,
        jsonb_array_length(coalesce(a.body->'slides','[]'::jsonb)) as slides,
        a.hook
       from scores s join assets a on a.id = s.asset_id
      where s.sample_ok
      order by s.asset_id, s.scored_at desc`,
  );

  if (rows.length === 0) {
    return { ...scoreRes, clusters: 0, recommendations: 0, forecasts: 0, promoted: 0, measured: 0 };
  }

  const baseline = median(rows.map((r) => r.composite));

  // ---- Cluster along categorical dimensions (doc 13 §5). Semantic dims need embeddings (M3+).
  const dims: Array<{ dimension: string; key: (a: ScoredAsset) => string }> = [
    { dimension: 'format', key: (a) => a.format },
    { dimension: 'cta', key: (a) => a.cta_kind ?? 'none' },
    { dimension: 'length', key: (a) => lengthBucket(a.slides) },
    { dimension: 'hook', key: (a) => hookTag(a.hook) },
  ];

  const clusters: Cluster[] = [];
  for (const d of dims) {
    const groups = new Map<string, ScoredAsset[]>();
    for (const a of rows) {
      const k = d.key(a);
      const g = groups.get(k) ?? [];
      g.push(a);
      groups.set(k, g);
    }
    for (const [label, members] of groups) {
      const scores = members.map((m) => m.composite);
      const avg = mean(scores);
      const confidence = clusterConfidence(scores);
      const { rows: cr } = await db.query<{ id: string }>(
        `insert into clusters (dimension, label, size, avg_score, confidence, "window")
         values ($1,$2,$3,$4,$5,'last_90') returning id`,
        [d.dimension, label, members.length, round(avg), round(confidence), ],
      );
      const clusterId = cr[0]!.id;
      for (const m of members) {
        await db.query(`insert into cluster_members (cluster_id, asset_id) values ($1,$2) on conflict do nothing`, [clusterId, m.asset_id]);
      }
      clusters.push({ id: clusterId, dimension: d.dimension, label, size: members.length, avg, confidence, members: members.map((m) => m.asset_id) });
    }
  }

  // ---- Pattern mining → recommendations (confidence-gated, doc 13 §6/§7).
  const recMin = await recommendationThreshold(db);
  const winning = clusters
    .filter((c) => c.size >= MIN_SUPPORT && c.avg > baseline * (1 + MIN_LIFT) && c.confidence >= recMin)
    .map((c) => ({ ...c, lift: (c.avg - baseline) / (baseline || 1) }))
    .sort((a, b) => b.lift * b.confidence - a.lift * a.confidence)
    .slice(0, 6);

  for (const c of winning) {
    const liftPct = Math.round(c.lift * 100);
    await db.query(
      `insert into recommendations (title, body, evidence, confidence, status, target_dept, created_by)
       values ($1,$2,$3,$4,'proposed','creative','recommendation_engine')`,
      [
        `Make more of ${c.dimension}=${c.label}`,
        `Make more of ${c.dimension} "${c.label}": avg score ${round(c.avg)} across ${c.size} posts (+${liftPct}% vs baseline ${round(baseline)}).`,
        JSON.stringify({ clusters: [c.id], sample: c.size, avg_score: round(c.avg), baseline: round(baseline), lift: round(c.lift, 3), dimension: c.dimension, label: c.label }),
        round(c.confidence),
      ],
    );
  }

  // ---- Forecast reach/followers (doc 13 §8), heuristic v1 with uncertainty bands.
  const forecasts = await forecast(db);

  // ---- Promote winning hook patterns into semantic memory (doc 05 §5.4).
  let promoted = 0;
  for (const c of clusters.filter((x) => x.dimension === 'hook' && x.size >= MIN_SUPPORT && x.avg > baseline)) {
    const { rows: eps } = await db.query<{ id: string }>(
      `select id from memory_episodes where asset_id = any($1::uuid[]) limit 20`,
      [c.members],
    );
    await db.query(
      `insert into memory_semantic (namespace, key, value, confidence, source_episodes)
       values ('preferred_hooks',$1,$2,$3,$4)
       on conflict (namespace, key) do update set value=excluded.value, confidence=excluded.confidence,
         source_episodes=excluded.source_episodes, updated_at=now()`,
      [
        c.label,
        JSON.stringify({ avg_score: round(c.avg), note: `Reuse '${c.label}' hooks — outperformed baseline`, samples: c.size }),
        round(c.confidence),
        eps.map((e) => e.id),
      ],
    );
    promoted++;
  }

  // ---- Close the loop (doc 13 §7.1): measure realized lift for accepted/implemented recs by
  // re-checking their pattern's current avg vs the baseline recorded when the rec was made.
  let measured = 0;
  const accepted = await db.query<{ id: string; evidence: { dimension?: string; label?: string; baseline?: number } }>(
    `select id, evidence from recommendations where status in ('accepted','implemented')`,
  );
  for (const r of accepted.rows) {
    const ev = r.evidence ?? {};
    const c = clusters.find((x) => x.dimension === ev.dimension && x.label === ev.label);
    if (!c) continue;
    const base = Number(ev.baseline ?? baseline) || baseline || 1;
    const lift = base > 0 ? (c.avg - base) / base : 0;
    await db.query(`update recommendations set realized_lift=$1, status='measured', updated_at=now() where id=$2`, [round(lift, 3), r.id]);
    measured++;
  }

  return { ...scoreRes, clusters: clusters.length, recommendations: winning.length, forecasts, promoted, measured };
}

async function recommendationThreshold(db: Pool): Promise<number> {
  const { rows } = await db.query<{ value: { recommendation_min?: number } }>(
    `select value from system_settings where key='confidence.thresholds'`,
  );
  return rows[0]?.value?.recommendation_min ?? 0.7;
}

async function forecast(db: Pool): Promise<number> {
  const { rows } = await db.query<{ reach: number; follows: number }>(
    `select coalesce(reach,0)::float8 as reach, coalesce(follows,0)::float8 as follows
       from metrics where "window"='lifetime' order by captured_at desc limit 30`,
  );
  if (rows.length === 0) return 0;
  const avgReach = mean(rows.map((r) => r.reach));
  const avgFollows = mean(rows.map((r) => r.follows));
  const plans: Array<{ metric: string; horizon: string; posts: number; per: number }> = [
    { metric: 'reach', horizon: '7d', posts: 3, per: avgReach },
    { metric: 'reach', horizon: '30d', posts: 12, per: avgReach },
    { metric: 'followers', horizon: '7d', posts: 3, per: avgFollows },
    { metric: 'followers', horizon: '30d', posts: 12, per: avgFollows },
  ];
  for (const p of plans) {
    const point = p.per * p.posts;
    await db.query(
      `insert into forecasts (metric, horizon, point, lower, upper, method)
       values ($1,$2,$3,$4,$5,'heuristic_v1')`,
      [p.metric, p.horizon, round(point), round(point * 0.75), round(point * 1.25)],
    );
  }
  return plans.length;
}

// ---- small stats helpers ----
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function clusterConfidence(scores: number[]): number {
  const m = mean(scores);
  const variance = mean(scores.map((x) => (x - m) ** 2));
  const std = Math.sqrt(variance);
  const sampleTerm = Math.min(1, scores.length / 3);
  const consistency = m > 0 ? Math.max(0, 1 - std / m) : 0;
  return 0.5 * sampleTerm + 0.5 * consistency;
}
function round(x: number, dp = 3): number {
  return Math.round(x * 10 ** dp) / 10 ** dp;
}
