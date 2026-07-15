// apps/worker/publishing/fire.ts
// Fire a scheduled publish at slot time. Source: spec/14 §4.1 (scheduler writes scheduled_at; a
// tick enqueues publish.fire at the slot; fire is idempotent), spec/12 §4.15–§4.16. Decoupled
// from the pipeline so publishing happens at the right time, not inline at draft time.
import type { Pool } from '@cos/db';
import type { AssetSnapshot } from '@cos/shared';
import type { CanvaAdapter } from '../tools/canva.js';
import type { PublisherAdapter } from '../tools/instagram.js';
import { collectMetrics } from '../analytics/collect.js';
import { publishOnce } from './publisher.js';

async function loadAssetSnapshot(db: Pool, assetId: string): Promise<AssetSnapshot> {
  const { rows } = await db.query<{
    title: string | null;
    hook: string | null;
    body: { slides?: AssetSnapshot['slides'] } | null;
    caption: string | null;
    hashtags: string[] | null;
    cta: AssetSnapshot['cta'] | null;
  }>(`select title, hook, body, caption, hashtags, cta from assets where id=$1`, [assetId]);
  const a = rows[0];
  if (!a) throw new Error(`asset ${assetId} not found`);
  return {
    ...(a.title != null ? { title: a.title } : {}),
    ...(a.hook != null ? { hook: a.hook } : {}),
    ...(a.body?.slides ? { slides: a.body.slides } : {}),
    ...(a.caption != null ? { caption: a.caption } : {}),
    ...(a.hashtags != null ? { hashtags: a.hashtags } : {}),
    ...(a.cta != null ? { cta: a.cta } : {}),
  };
}

export interface FireResult {
  assetId: string;
  externalId: string;
  alreadyPublished: boolean;
  metricsWritten: number;
}

/** Idempotent publish + measure for one asset (publish.fire). Safe to call twice. */
export async function firePublish(
  db: Pool,
  tools: { canva: CanvaAdapter; instagram: PublisherAdapter },
  assetId: string,
): Promise<FireResult> {
  const asset = await loadAssetSnapshot(db, assetId);

  // Publish (exactly-once, doc 04 §7.3).
  const res = await publishOnce(db, tools.instagram, assetId, asset);
  await db.query(`update assets set status='published', updated_at=now() where id=$1`, [assetId]);
  await db.query(`update schedules set status='published' where asset_id=$1 and platform=$2`, [assetId, tools.instagram.platform]);
  await db.query(
    `insert into pipeline_stage_runs (asset_id, stage, status, agent_id, notes, passed, started_at, finished_at)
     values ($1,'publishing',$2,'cross_platform_publisher',$3,true, now(), now())`,
    [assetId, 'passed', `${res.alreadyPublished ? 'already published' : 'published'} ${res.externalId}`],
  );

  // Measure (doc 12 §4.16).
  const metrics = await collectMetrics(db, tools.instagram, assetId);
  await db.query(
    `insert into pipeline_stage_runs (asset_id, stage, status, agent_id, notes, passed, started_at, finished_at)
     values ($1,'analytics','passed','instagram_analyst',$2,true, now(), now())`,
    [assetId, `metrics for ${metrics.publications} publication(s)`],
  );

  return { assetId, externalId: res.externalId, alreadyPublished: res.alreadyPublished, metricsWritten: metrics.metricsWritten };
}
