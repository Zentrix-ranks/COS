// apps/web/server/analytics.ts
// Analytics tab data access. Source: spec/13 §14 (analytics surface), spec/07 §6.2.
import 'server-only';
import type { RecommendationStatus } from '@cos/shared';
import { queryAsRole } from './db.js';

export interface RecommendationRow {
  id: string;
  title: string;
  body: string;
  confidence: number;
  status: string;
  evidence: Record<string, unknown>;
}

export async function listRecommendations(): Promise<RecommendationRow[] | null> {
  return queryAsRole<RecommendationRow>(
    `select id, title, body, confidence, status, evidence
       from recommendations
      order by (status='proposed') desc, confidence desc, created_at desc
      limit 20`,
  );
}

export interface ScoredAssetRow {
  asset_id: string;
  title: string | null;
  type: string;
  composite: number;
  label: string | null;
  percentile: number | null;
}

export async function topBottomAssets(): Promise<{ top: ScoredAssetRow[]; bottom: ScoredAssetRow[] }> {
  const rows =
    (await queryAsRole<ScoredAssetRow>(
      `select distinct on (s.asset_id) s.asset_id, a.title, a.type, s.composite::float8 as composite,
              s.label, s.percentile::float8 as percentile
         from scores s join assets a on a.id = s.asset_id
        order by s.asset_id, s.scored_at desc`,
    )) ?? [];
  const sorted = [...rows].sort((a, b) => b.composite - a.composite);
  return { top: sorted.slice(0, 5), bottom: sorted.slice(-5).reverse() };
}

export interface ClusterRow {
  dimension: string;
  label: string;
  size: number;
  avg_score: number | null;
  confidence: number | null;
}

export async function listClusters(): Promise<ClusterRow[]> {
  return (
    (await queryAsRole<ClusterRow>(
      `select dimension, label, size, avg_score::float8 as avg_score, confidence::float8 as confidence
         from clusters order by dimension, avg_score desc nulls last`,
    )) ?? []
  );
}

export interface ForecastRow {
  metric: string;
  horizon: string;
  point: number | null;
  lower: number | null;
  upper: number | null;
}

export async function listForecasts(): Promise<ForecastRow[]> {
  return (
    (await queryAsRole<ForecastRow>(
      `select distinct on (metric, horizon) metric, horizon, point::float8 as point,
              lower::float8 as lower, upper::float8 as upper
         from forecasts order by metric, horizon, created_at desc`,
    )) ?? []
  );
}

export async function decideRecommendation(
  id: string,
  status: Extract<RecommendationStatus, 'accepted' | 'rejected'>,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = await queryAsRole<{ id: string }>(
    `update recommendations set status=$1, updated_at=now() where id=$2 and status='proposed' returning id`,
    [status, id],
  );
  if (rows === null) return { ok: false, reason: 'db unavailable' };
  if (rows.length === 0) return { ok: false, reason: 'not found or already decided' };
  return { ok: true };
}
