// apps/worker/tools/canva.ts
// Canva design adapter. Source: spec/08 §5.1 (Canva), spec/12 §4.11 (Design), §4.12 (Thumbnail).
// Idempotency: design creation keyed by asset_id + version (doc 08 §5.1). The MockCanvaAdapter
// returns deterministic ids/exports so the pipeline runs without Canva OAuth; the real adapter
// (M2+ with the Canva MCP tools) implements the same interface.
import type { CarouselSlide } from '@cos/shared';

export interface CanvaExport {
  url: string;
  kind: 'png' | 'pdf' | 'mp4';
}

export interface CanvaDesign {
  designId: string;
  exports: CanvaExport[];
}

export interface CanvaAdapter {
  readonly name: string;
  createCarouselDesign(args: { assetId: string; version: number; slides: CarouselSlide[] }): Promise<CanvaDesign>;
  createThumbnail(args: { assetId: string; version: number; hook: string }): Promise<CanvaDesign>;
}

export class MockCanvaAdapter implements CanvaAdapter {
  readonly name = 'mock-canva';
  private readonly cache = new Map<string, CanvaDesign>();

  private idempotent(key: string, make: () => CanvaDesign): CanvaDesign {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const made = make();
    this.cache.set(key, made);
    return made;
  }

  async createCarouselDesign(args: { assetId: string; version: number; slides: CarouselSlide[] }): Promise<CanvaDesign> {
    const key = `carousel:${args.assetId}:${args.version}`;
    return this.idempotent(key, () => ({
      designId: `canva_${hash(key)}`,
      exports: args.slides.map((s) => ({ url: `mock://canva/${hash(key)}/slide-${s.n}.png`, kind: 'png' as const })),
    }));
  }

  async createThumbnail(args: { assetId: string; version: number; hook: string }): Promise<CanvaDesign> {
    const key = `thumb:${args.assetId}:${args.version}`;
    return this.idempotent(key, () => ({
      designId: `canva_${hash(key)}`,
      exports: [{ url: `mock://canva/${hash(key)}/cover.png`, kind: 'png' as const }],
    }));
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

/**
 * Real Canva Connect API adapter (doc 08 §5.1). Env-gated by CANVA_ACCESS_TOKEN. When a brand
 * template id is configured it autofills copy into the template; otherwise it creates a design.
 * It then exports to PNG (async job → poll) and returns the export URLs. Design creation is
 * idempotency-keyed by asset_id+version upstream via the DB (assets.design). Needs a live token.
 */
export class CanvaConnectAdapter implements CanvaAdapter {
  readonly name = 'canva-connect';
  private readonly base = 'https://api.canva.com/rest/v1';

  constructor(
    private readonly token: string,
    private readonly brandTemplateId?: string,
  ) {}

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { ...init, headers: this.headers() });
    const body = (await res.json()) as T & { message?: string };
    if (!res.ok) throw new Error(`Canva ${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  }

  /** Poll an async job (autofill/export) until success; returns the job payload. */
  private async pollJob<T>(path: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
      const j = await this.json<{ job: { status: string } & T }>(path);
      if (j.job.status === 'success') return j.job;
      if (j.job.status === 'failed') throw new Error(`Canva job failed: ${path}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Canva job timed out: ${path}`);
  }

  private async createDesignId(data: Record<string, unknown>): Promise<string> {
    if (this.brandTemplateId) {
      const created = await this.json<{ job: { id: string } }>(`/autofills`, {
        method: 'POST',
        body: JSON.stringify({ brand_template_id: this.brandTemplateId, data }),
      });
      const done = await this.pollJob<{ result?: { design?: { id: string } } }>(`/autofills/${created.job.id}`);
      return done.result?.design?.id ?? created.job.id;
    }
    const design = await this.json<{ design: { id: string } }>(`/designs`, {
      method: 'POST',
      body: JSON.stringify({ design_type: { type: 'preset', name: 'instagram_post' } }),
    });
    return design.design.id;
  }

  private async exportPng(designId: string): Promise<CanvaExport[]> {
    const created = await this.json<{ job: { id: string } }>(`/exports`, {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format: { type: 'png' } }),
    });
    const done = await this.pollJob<{ urls?: string[] }>(`/exports/${created.job.id}`);
    return (done.urls ?? []).map((url) => ({ url, kind: 'png' as const }));
  }

  async createCarouselDesign(args: { assetId: string; version: number; slides: CarouselSlide[] }): Promise<CanvaDesign> {
    const data = Object.fromEntries(args.slides.map((s) => [`slide_${s.n}`, { type: 'text', text: s.text }]));
    const designId = await this.createDesignId(data);
    return { designId, exports: await this.exportPng(designId) };
  }

  async createThumbnail(args: { assetId: string; version: number; hook: string }): Promise<CanvaDesign> {
    const designId = await this.createDesignId({ cover: { type: 'text', text: args.hook } });
    return { designId, exports: await this.exportPng(designId) };
  }
}

export function getCanvaAdapter(): CanvaAdapter {
  const token = process.env.CANVA_ACCESS_TOKEN;
  if (token) return new CanvaConnectAdapter(token, process.env.CANVA_BRAND_TEMPLATE_ID);
  // Default to mock for keyless dev (doc 02 §9 local).
  return new MockCanvaAdapter();
}
