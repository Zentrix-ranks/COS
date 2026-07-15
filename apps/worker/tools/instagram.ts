// apps/worker/tools/instagram.ts
// Instagram publisher + insights adapter. Source: spec/08 §4.1/§4.2 (PublisherAdapter interface,
// idempotency), spec/12 §4.15 (Publishing), §4.16 (Analytics).
//
// The common PublisherAdapter: publish(asset, target) → {externalId, permalink} and
// insights(externalId) → metrics. The MockInstagramAdapter simulates the platform's own
// idempotency: publishing with a previously-seen idempotency_key returns the SAME media id
// without creating a second post — so retries never double-post (doc 08 §4.1). Real IG Graph
// API adapter (M2+ with a test account token) implements the same interface.
import type { AssetSnapshot } from '@cos/shared';

export interface PublishResult {
  externalId: string;
  permalink: string;
  deduped: boolean; // true when the idempotency key was already seen (no new post created)
}

export interface InsightsResult {
  reach: number;
  impressions: number;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  profile_visits: number;
  follows: number;
  raw: Record<string, unknown>;
}

export interface PublisherAdapter {
  readonly name: string;
  readonly platform: 'instagram';
  publish(args: { idempotencyKey: string; asset: AssetSnapshot }): Promise<PublishResult>;
  insights(externalId: string): Promise<InsightsResult>;
}

export class MockInstagramAdapter implements PublisherAdapter {
  readonly name = 'mock-instagram';
  readonly platform = 'instagram' as const;
  // Simulates the platform: idempotency_key → the media it created (survives retries).
  private readonly posted = new Map<string, string>();

  async publish(args: { idempotencyKey: string; asset: AssetSnapshot }): Promise<PublishResult> {
    const existing = this.posted.get(args.idempotencyKey);
    if (existing) {
      return { externalId: existing, permalink: permalinkFor(existing), deduped: true };
    }
    const externalId = `IG_${hash(args.idempotencyKey)}`;
    this.posted.set(args.idempotencyKey, externalId);
    return { externalId, permalink: permalinkFor(externalId), deduped: false };
  }

  async insights(externalId: string): Promise<InsightsResult> {
    // Deterministic pseudo-metrics derived from the media id (stable across windows here).
    const n = parseInt(hash(externalId).slice(0, 6), 16);
    const reach = 1000 + (n % 9000);
    return {
      reach,
      impressions: Math.round(reach * 1.4),
      likes: Math.round(reach * 0.06),
      saves: Math.round(reach * 0.03),
      shares: Math.round(reach * 0.015),
      comments: Math.round(reach * 0.008),
      profile_visits: Math.round(reach * 0.02),
      follows: Math.round(reach * 0.005),
      raw: { source: 'mock-instagram', externalId },
    };
  }
}

function permalinkFor(externalId: string): string {
  return `https://instagram.com/p/${externalId}`;
}

/**
 * Real Instagram Graph API adapter (doc 08 §4.1). Env-gated by INSTAGRAM_GRAPH_TOKEN +
 * INSTAGRAM_BUSINESS_ACCOUNT_ID. Carousel publish is the documented 3-step flow: create per-image
 * item containers → a CAROUSEL container → media_publish. Exactly-once is enforced upstream by
 * publications' unique (asset_id, platform) + the pre-publish claim (doc 04 §7.3); the Graph API
 * has no native idempotency key, so `deduped` is always false here. Needs a live token to run.
 */
export class InstagramGraphAdapter implements PublisherAdapter {
  readonly name = 'instagram-graph';
  readonly platform = 'instagram' as const;
  private readonly base = `https://graph.facebook.com/${process.env.INSTAGRAM_GRAPH_API_VERSION ?? 'v21.0'}`;

  constructor(
    private readonly token: string,
    private readonly igUserId: string,
  ) {}

  private async post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({ ...params, access_token: this.token });
    const res = await fetch(`${this.base}/${path}`, { method: 'POST', body });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`IG Graph ${path} ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  async publish(args: { idempotencyKey: string; asset: AssetSnapshot }): Promise<PublishResult> {
    const urls = args.asset.mediaUrls ?? [];
    if (urls.length === 0) throw new Error('IG publish requires hosted media URLs (asset.mediaUrls from Design)');
    const caption = [args.asset.caption, (args.asset.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');

    let creationId: string;
    if (urls.length === 1) {
      creationId = String((await this.post(`${this.igUserId}/media`, { image_url: urls[0]!, caption })).id);
    } else {
      // Carousel: item containers → carousel container.
      const children: string[] = [];
      for (const url of urls) {
        const item = await this.post(`${this.igUserId}/media`, { image_url: url, is_carousel_item: 'true' });
        children.push(String(item.id));
      }
      const container = await this.post(`${this.igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
      creationId = String(container.id);
    }
    const published = await this.post(`${this.igUserId}/media_publish`, { creation_id: creationId });
    const externalId = String(published.id);
    return { externalId, permalink: permalinkFor(externalId), deduped: false };
  }

  async insights(externalId: string): Promise<InsightsResult> {
    const metrics = 'reach,impressions,saved,likes,comments,shares';
    const res = await fetch(`${this.base}/${externalId}/insights?metric=${metrics}&access_token=${this.token}`);
    const json = (await res.json()) as { data?: Array<{ name: string; values: Array<{ value: number }> }> };
    const get = (name: string) => json.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;
    return {
      reach: get('reach'),
      impressions: get('impressions'),
      likes: get('likes'),
      saves: get('saved'),
      shares: get('shares'),
      comments: get('comments'),
      profile_visits: 0, // account-level metric, not per-media
      follows: 0,
      raw: json as Record<string, unknown>,
    };
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function getPublisherAdapter(): PublisherAdapter {
  const token = process.env.INSTAGRAM_GRAPH_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (token && igUserId) return new InstagramGraphAdapter(token, igUserId);
  // Default to mock for keyless dev (doc 02 §9 local).
  return new MockInstagramAdapter();
}
