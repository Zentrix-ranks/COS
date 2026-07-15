// apps/worker/publishing/tick.ts
// publish.tick — enqueue publish.fire for every schedule due now (doc 14 §4.1/§7). Idempotent:
// a stable jobId per (asset,platform,slot) means overlapping ticks never stack; publishing
// uniqueness at the DB is the last line of defense (doc 04 §7.3).
import type { Pool } from '@cos/db';
import { JOBS } from '@cos/shared';
import type { Queue } from 'bullmq';

export async function publishTick(db: Pool, queue: Queue): Promise<{ enqueued: number }> {
  const { rows } = await db.query<{ asset_id: string; platform: string; scheduled_at: string }>(
    `select asset_id, platform, scheduled_at from schedules
      where status='scheduled' and scheduled_at <= now()
      order by scheduled_at asc limit 50`,
  );
  let enqueued = 0;
  for (const s of rows) {
    const slot = new Date(s.scheduled_at).getTime();
    // BullMQ jobIds may not contain ':' — use '-' so overlapping ticks dedupe on the same slot.
    await queue.add(JOBS.publishFire, { assetId: s.asset_id, platform: s.platform }, { jobId: `fire-${s.asset_id}-${s.platform}-${slot}` });
    enqueued++;
  }
  return { enqueued };
}
