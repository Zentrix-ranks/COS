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

export function getCanvaAdapter(): CanvaAdapter {
  // Real Canva adapter lands with the Canva MCP tools; default to mock for keyless dev.
  return new MockCanvaAdapter();
}
