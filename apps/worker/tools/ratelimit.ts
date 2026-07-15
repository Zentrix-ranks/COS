// apps/worker/tools/ratelimit.ts
// Per-tool rate limiting. Source: spec/08 §2.1 (per-tool token buckets throttle research/publish/
// model calls to provider limits), spec/02 §6.3 (rate-limit check before invoke), spec/06 §7
// (rate_limit is a retryable error). A fixed-window Redis counter approximates a token bucket:
// simple, atomic (INCR), and self-expiring. No Redis → no limiting (dev fallback).
import IORedis from 'ioredis';

export class RateLimitError extends Error {
  constructor(tool: string) {
    super(`rate limit exceeded for tool '${tool}'`);
    this.name = 'RateLimitError';
  }
}

interface Limit {
  limit: number;
  windowSec: number;
}

// Conservative defaults; per-tool overrides tuned to provider limits (doc 08). Generous enough
// that normal pipeline runs are never throttled.
const DEFAULTS: Record<string, Limit> = {
  'openrouter.generate': { limit: 600, windowSec: 60 },
  'instagram.publish': { limit: 25, windowSec: 3600 },
  'canva.export': { limit: 100, windowSec: 60 },
  default: { limit: 300, windowSec: 60 },
};

let redis: IORedis | null | undefined;
function getRedis(): IORedis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false }) : null;
  return redis;
}

export interface TakeResult {
  allowed: boolean;
  remaining: number;
}

/** Consume one token for `tool`. Pass `override` (tests) to force a small window/limit. */
export async function takeToken(tool: string, override?: Limit): Promise<TakeResult> {
  const r = getRedis();
  if (!r) return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  const cfg = override ?? DEFAULTS[tool] ?? DEFAULTS.default!;
  const windowIdx = Math.floor(Date.now() / 1000 / cfg.windowSec);
  const key = `rl:${tool}:${windowIdx}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, cfg.windowSec * 2);
  return { allowed: n <= cfg.limit, remaining: Math.max(0, cfg.limit - n) };
}
