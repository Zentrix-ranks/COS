// apps/worker/publishing/publisher.ts
// Idempotent, exactly-once publishing. Source: spec/12 §4.15, spec/04 §7.3 (publications:
// unique (asset_id, platform) + unique (idempotency_key)), spec/02 §8.4 (idempotency keys →
// no duplicates on retry), spec/08 §4.1. Every outward publish is idempotency-keyed and
// audit-logged (doc 02 §8.1); a published row is never re-posted.
import type { Pool } from '@cos/db';
import type { AssetSnapshot } from '@cos/shared';
import type { PublisherAdapter } from '../tools/instagram.js';

export interface PublishOnceResult {
  externalId: string;
  permalink: string;
  alreadyPublished: boolean;
}

export async function publishOnce(
  db: Pool,
  adapter: PublisherAdapter,
  assetId: string,
  asset: AssetSnapshot,
): Promise<PublishOnceResult> {
  const platform = adapter.platform;
  const idemKey = `${assetId}:${platform}`;

  // 1. Claim the (asset, platform) slot. The unique constraint makes this the single source of
  //    truth: at most one publications row per (asset, platform) can ever exist.
  const claim = await db.query<{ id: string }>(
    `insert into publications (asset_id, platform, status, idempotency_key)
     values ($1,$2,'publishing',$3)
     on conflict (asset_id, platform) do nothing
     returning id`,
    [assetId, platform, idemKey],
  );

  let pubId: string;
  if (claim.rowCount === 0) {
    const existing = await db.query<{ id: string; status: string; external_id: string | null; permalink: string | null }>(
      `select id, status, external_id, permalink from publications where asset_id=$1 and platform=$2`,
      [assetId, platform],
    );
    const row = existing.rows[0]!;
    if (row.status === 'published') {
      // Already published — do NOT post again (exactly-once).
      return { externalId: row.external_id ?? '', permalink: row.permalink ?? '', alreadyPublished: true };
    }
    pubId = row.id; // adopt an in-flight/failed claim
  } else {
    pubId = claim.rows[0]!.id;
  }

  // 2. Outward call, idempotency-keyed (the platform itself dedupes on the key).
  const result = await adapter.publish({ idempotencyKey: idemKey, asset });

  // 3. Transition to published exactly once.
  const upd = await db.query<{ id: string }>(
    `update publications set status='published', external_id=$1, permalink=$2, published_at=now()
     where id=$3 and status <> 'published' returning id`,
    [result.externalId, result.permalink, pubId],
  );
  if (upd.rowCount === 1) {
    await db.query(
      `insert into audit_log (actor_type, actor_id, action, target, after)
       values ('agent','cross_platform_publisher','publish',$1,$2)`,
      [result.externalId, JSON.stringify({ platform, permalink: result.permalink, deduped: result.deduped })],
    );
  }

  return { externalId: result.externalId, permalink: result.permalink, alreadyPublished: false };
}
