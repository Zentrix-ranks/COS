// apps/worker/analytics/collect.ts
// Metric collection. Source: spec/12 §4.16 (Analytics), spec/13 (analytics engine — scoring
// and learning land in M3), spec/04 §8.1 (metrics). instagram_analyst reads insights for each
// publication and stores a metrics row per window.
import type { Pool } from '@cos/db';
import type { PublisherAdapter } from '../tools/instagram.js';

export interface CollectResult {
  publications: number;
  metricsWritten: number;
}

export async function collectMetrics(
  db: Pool,
  adapter: PublisherAdapter,
  assetId: string,
  window = 'lifetime',
): Promise<CollectResult> {
  const { rows: pubs } = await db.query<{ id: string; external_id: string | null }>(
    `select id, external_id from publications where asset_id=$1 and status='published' and platform=$2`,
    [assetId, adapter.platform],
  );

  let metricsWritten = 0;
  for (const pub of pubs) {
    if (!pub.external_id) continue;
    const m = await adapter.insights(pub.external_id);
    await db.query(
      `insert into metrics (publication_id, asset_id, "window", reach, impressions, likes, saves, shares, comments, profile_visits, follows, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [pub.id, assetId, window, m.reach, m.impressions, m.likes, m.saves, m.shares, m.comments, m.profile_visits, m.follows, JSON.stringify(m.raw)],
    );
    metricsWritten += 1;
  }
  return { publications: pubs.length, metricsWritten };
}
