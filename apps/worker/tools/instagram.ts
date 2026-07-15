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

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function getPublisherAdapter(): PublisherAdapter {
  // Real IG Graph adapter lands with a test-account token; default to mock for keyless dev.
  return new MockInstagramAdapter();
}
