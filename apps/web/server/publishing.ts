// apps/web/server/publishing.ts
// Publishing tab data. Source: spec/07 §6.3 (per-platform queued/scheduled/published + external
// permalinks; calendar), spec/12 §4.14–§4.16.
import 'server-only';
import { getPool } from './db.js';

export interface ScheduleRow {
  asset_id: string;
  title: string | null;
  platform: string;
  scheduled_at: string;
  status: string;
}

export interface PublicationRow {
  asset_id: string;
  title: string | null;
  platform: string;
  external_id: string | null;
  permalink: string | null;
  status: string;
  published_at: string | null;
  reach: number | null;
}

export interface PublishingData {
  scheduled: ScheduleRow[];
  published: PublicationRow[];
}

export async function getPublishing(): Promise<PublishingData | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const scheduled = (
      await p.query<ScheduleRow>(
        `select s.asset_id, a.title, s.platform, s.scheduled_at, s.status
           from schedules s join assets a on a.id = s.asset_id
          where s.status in ('scheduled','publishing')
          order by s.scheduled_at asc limit 30`,
      )
    ).rows;
    const published = (
      await p.query<PublicationRow>(
        `select pub.asset_id, a.title, pub.platform, pub.external_id, pub.permalink, pub.status, pub.published_at,
                (select reach from metrics m where m.publication_id = pub.id order by captured_at desc limit 1) as reach
           from publications pub join assets a on a.id = pub.asset_id
          order by pub.published_at desc nulls last limit 30`,
      )
    ).rows;
    return { scheduled, published };
  } catch {
    return null;
  }
}
