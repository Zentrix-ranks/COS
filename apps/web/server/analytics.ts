// apps/web/server/analytics.ts
// Analytics tab data access. Source: spec/13 §14 (analytics surface), spec/07 §6.2.
import 'server-only';
import type { RecommendationStatus } from '@cos/shared';
import { getPool } from './db.js';

export interface RecommendationRow {
  id: string;
  title: string;
  body: string;
  confidence: number;
  status: string;
  evidence: Record<string, unknown>;
}

export async function listRecommendations(): Promise<RecommendationRow[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<RecommendationRow>(
      `select id, title, body, confidence, status, evidence
         from recommendations
        order by (status='proposed') desc, confidence desc, created_at desc
        limit 20`,
    );
    return rows;
  } catch {
    return null;
  }
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
  const p = getPool();
  if (!p) return { top: [], bottom: [] };
  try {
    const { rows } = await p.query<ScoredAssetRow>(
      `select distinct on (s.asset_id) s.asset_id, a.title, a.type, s.composite::float8 as composite,
              s.label, s.percentile::float8 as percentile
         from scores s join assets a on a.id = s.asset_id
        order by s.asset_id, s.scored_at desc`,
    );
    const sorted = [...rows].sort((a, b) => b.composite - a.composite);
    return { top: sorted.slice(0, 5), bottom: sorted.slice(-5).reverse() };
  } catch {
    return { top: [], bottom: [] };
  }
}

export interface ClusterRow {
  dimension: string;
  label: string;
  size: number;
  avg_score: number | null;
  confidence: number | null;
}

export async function listClusters(): Promise<ClusterRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query<ClusterRow>(
      `select dimension, label, size, avg_score::float8 as avg_score, confidence::float8 as confidence
         from clusters order by dimension, avg_score desc nulls last`,
    );
    return rows;
  } catch {
    return [];
  }
}

export interface ForecastRow {
  metric: string;
  horizon: string;
  point: number | null;
  lower: number | null;
  upper: number | null;
}

export async function listForecasts(): Promise<ForecastRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query<ForecastRow>(
      `select distinct on (metric, horizon) metric, horizon, point::float8 as point,
              lower::float8 as lower, upper::float8 as upper
         from forecasts order by metric, horizon, created_at desc`,
    );
    return rows;
  } catch {
    return [];
  }
}

export async function decideRecommendation(
  id: string,
  status: Extract<RecommendationStatus, 'accepted' | 'rejected'>,
): Promise<{ ok: boolean; reason?: string }> {
  const p = getPool();
  if (!p) return { ok: false, reason: 'db unavailable' };
  try {
    const res = await p.query(`update recommendations set status=$1, updated_at=now() where id=$2 and status='proposed'`, [status, id]);
    if (res.rowCount === 0) return { ok: false, reason: 'not found or already decided' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
