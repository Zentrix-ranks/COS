// apps/worker/orchestrator/carousel-pipeline.ts
// The carousel pipeline graph (M1: Idea → … → Approval). Source: spec/06 §5.2 (pipeline graph),
// spec/12 §4 (stages) + §6 (carousel variation). Design/Thumbnail/Visual-QA are stubs here
// (Canva lands in M2, doc 16 §6). CTA is produced by cta_specialist as a sub-step of Draft
// (there is no `cta` pipeline_stage enum value — doc 04 §3).
import type { CreativeStageKey, PromptContext } from '@cos/prompts';
import type { PipelineState } from '@cos/shared';
import { type ExecCtx, runStage, type StageSpec } from '../agents/executor.js';
import { publishOnce } from '../publishing/publisher.js';
import { collectMetrics } from '../analytics/collect.js';

const DEFAULT_PERSONA = {
  name: 'Aspiring prop-firm trader',
  pains: ['blows funded accounts', 'no consistent edge', 'overtrades'],
};
const DEFAULT_BRAND_VOICE =
  'Confident, evidence-led, no hype, always risk-aware; never promises guaranteed returns.';

function baseCtx(state: PipelineState): PromptContext {
  return {
    idea: { title: state.ideaTitle, angle: state.ideaAngle },
    format: state.format,
    persona: DEFAULT_PERSONA,
    brandVoiceSummary: DEFAULT_BRAND_VOICE,
    slides: Math.max(1, state.budget.units), // frames/slides/scenes per format (doc 12 §6)
    asset: state.asset,
  };
}

/** A node the engine can run, with its specific stage generic erased. */
interface RunnableStage {
  node: string;
  run(ctx: ExecCtx, state: PipelineState): Promise<{ passed: boolean }>;
}

function defineStage<K extends CreativeStageKey>(spec: StageSpec<K>): RunnableStage {
  return { node: spec.node, run: (ctx, state) => runStage(ctx, spec, state) };
}

const SPECS: Record<string, RunnableStage> = {
  idea_generation: defineStage({
    node: 'idea_generation',
    kind: 'idea_generation',
    agentId: 'creative_director',
    pipelineStage: 'idea_generation',
    recallNamespace: 'themes',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.title = o.title;
      s.ideaTitle = o.title;
      s.ideaAngle = o.angle;
    },
  }),
  hook_creation: defineStage({
    node: 'hook_creation',
    kind: 'hook_creation',
    agentId: 'hook_writer',
    pipelineStage: 'hook_creation',
    recallNamespace: 'preferred_hooks',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.hook = o.chosen_hook;
    },
  }),
  outline: defineStage({
    node: 'outline',
    kind: 'outline',
    agentId: 'carousel_writer',
    pipelineStage: 'outline',
    recallNamespace: 'winners',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.slides = o.slides.map((sl) => ({ n: sl.n, text: sl.point }));
    },
  }),
  draft: defineStage({
    node: 'draft',
    kind: 'draft',
    agentId: 'carousel_writer',
    pipelineStage: 'draft',
    recallNamespace: 'winners',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.slides = o.slides.map((sl) => ({ n: sl.n, text: sl.text, design_intent: sl.design_intent }));
      s.asset.caption = o.caption;
    },
  }),
  cta: defineStage({
    node: 'cta',
    kind: 'cta',
    agentId: 'cta_specialist',
    recallNamespace: 'cta_library',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.cta = { text: o.cta_text, kind: o.kind, placement: o.placement };
    },
  }),
  brand_review: defineStage({
    node: 'brand_review',
    kind: 'brand_review',
    agentId: 'brand_voice_manager',
    pipelineStage: 'brand_review',
    recallNamespace: 'brand_rules',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.caption = o.edited_caption;
    },
    gate: (o) => ({ passed: o.pass, notes: o.violations.map((v) => v.issue).join('; ') || undefined }),
  }),
  grammar: defineStage({
    node: 'grammar',
    kind: 'grammar',
    agentId: 'brand_voice_manager',
    pipelineStage: 'grammar',
    recallNamespace: 'writing_style',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.caption = o.clean_caption;
    },
  }),
  seo: defineStage({
    node: 'seo',
    kind: 'seo',
    agentId: 'carousel_writer',
    pipelineStage: 'seo',
    recallNamespace: 'winners',
    buildCtx: baseCtx,
    apply: (s, o) => {
      s.asset.hashtags = o.hashtags;
      s.asset.caption = o.optimized_caption;
    },
  }),
  ig_optimisation: defineStage({
    node: 'ig_optimisation',
    kind: 'ig_optimisation',
    agentId: 'creative_director',
    pipelineStage: 'ig_optimisation',
    recallNamespace: 'winners',
    buildCtx: baseCtx,
    apply: () => {
      /* IG tuning notes only; no asset mutation in M1 */
    },
  }),
};

/**
 * Ordered node list for the carousel path. `cta` and `visual_qa` are sub/gate nodes.
 * M2 extends past approval into scheduling → publishing → analytics (doc 12 §4.14–§4.16).
 * Learning + memory_update arrive with M3.
 */
export const CAROUSEL_ORDER = [
  'idea_generation',
  'hook_creation',
  'outline',
  'draft',
  'cta',
  'brand_review',
  'grammar',
  'seo',
  'ig_optimisation',
  'design',
  'thumbnail',
  'visual_qa',
  'approval',
  'scheduling',
  'publishing',
  'analytics',
] as const;

export type CarouselNode = (typeof CAROUSEL_ORDER)[number];

async function writeStageRun(
  ctx: ExecCtx,
  assetId: string,
  stage: string,
  agentId: string,
  passed: boolean,
  notes: string,
  output?: unknown,
): Promise<void> {
  await ctx.db.query(
    `insert into pipeline_stage_runs (asset_id, stage, status, agent_id, output, notes, passed, started_at, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7, now(), now())`,
    [assetId, stage, passed ? 'passed' : 'failed', agentId, output ? JSON.stringify(output) : null, notes, passed],
  );
}

/** Run one node; returns pass/fail (gates) or true for non-gate nodes. */
export async function runCarouselNode(ctx: ExecCtx, node: CarouselNode, state: PipelineState): Promise<{ passed: boolean }> {
  // ---- Design (Canva). doc 12 §4.11, doc 08 §5.1 (idempotent by asset_id+version).
  if (node === 'design') {
    ctx.publish({ node: 'design', agentId: 'canva_designer', status: 'running' });
    const design = await ctx.tools.canva.createCarouselDesign({
      assetId: state.assetId,
      version: 1,
      slides: state.asset.slides ?? [],
    });
    await ctx.db.query(`update assets set design=$1, updated_at=now() where id=$2`, [
      JSON.stringify({ canva_design_id: design.designId, exports: design.exports }),
      state.assetId,
    ]);
    await writeStageRun(ctx, state.assetId, 'design', 'canva_designer', true, `Canva design ${design.designId}`, design);
    ctx.publish({ node: 'design', agentId: 'canva_designer', status: 'passed' });
    return { passed: true };
  }
  if (node === 'thumbnail') {
    ctx.publish({ node: 'thumbnail', agentId: 'thumbnail_creator', status: 'running' });
    const thumb = await ctx.tools.canva.createThumbnail({ assetId: state.assetId, version: 1, hook: state.asset.hook ?? '' });
    await writeStageRun(ctx, state.assetId, 'thumbnail', 'thumbnail_creator', true, `cover ${thumb.designId}`, thumb);
    ctx.publish({ node: 'thumbnail', agentId: 'thumbnail_creator', status: 'passed' });
    return { passed: true };
  }
  // ---- Visual QA gate (no enum stage). Fail-closed if there is no design. doc 12 §4.12b.
  if (node === 'visual_qa') {
    const hasDesign = (state.asset.slides?.length ?? 0) > 0;
    state.checks.design = { stage: 'design', passed: hasDesign, notes: hasDesign ? 'visual QA passed' : 'no design' };
    ctx.publish({ node: 'visual_qa', agentId: 'visual_qa', status: hasDesign ? 'passed' : 'failed' });
    return { passed: hasDesign };
  }
  // ---- Scheduling. doc 12 §4.14. Best-time model is analytics-driven in M3; M2 picks a slot.
  if (node === 'scheduling') {
    ctx.publish({ node: 'scheduling', agentId: 'scheduler', status: 'running' });
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h placeholder slot
    await ctx.db.query(
      `insert into schedules (asset_id, platform, scheduled_at, reason, created_by)
       values ($1,'instagram',$2,'M2 default slot (+2h); analytics best-time in M3','scheduler')
       on conflict (asset_id, platform) do nothing`,
      [state.assetId, scheduledAt.toISOString()],
    );
    await ctx.db.query(`update assets set status='scheduled', updated_at=now() where id=$1`, [state.assetId]);
    await writeStageRun(ctx, state.assetId, 'scheduling', 'scheduler', true, `scheduled ${scheduledAt.toISOString()}`);
    ctx.publish({ node: 'scheduling', agentId: 'scheduler', status: 'passed' });
    return { passed: true };
  }
  // ---- Publishing (exactly-once). doc 12 §4.15, doc 04 §7.3.
  if (node === 'publishing') {
    ctx.publish({ node: 'publishing', agentId: 'cross_platform_publisher', status: 'running' });
    const res = await publishOnce(ctx.db, ctx.tools.instagram, state.assetId, state.asset);
    await ctx.db.query(`update assets set status='published', updated_at=now() where id=$1`, [state.assetId]);
    await writeStageRun(ctx, state.assetId, 'publishing', 'cross_platform_publisher', true, `${res.alreadyPublished ? 'already published' : 'published'} ${res.externalId}`, res);
    ctx.publish({ node: 'publishing', agentId: 'cross_platform_publisher', status: 'passed' });
    return { passed: true };
  }
  // ---- Analytics (collect metrics). doc 12 §4.16. Scoring/learning are M3.
  if (node === 'analytics') {
    ctx.publish({ node: 'analytics', agentId: 'instagram_analyst', status: 'running' });
    const res = await collectMetrics(ctx.db, ctx.tools.instagram, state.assetId);
    await writeStageRun(ctx, state.assetId, 'analytics', 'instagram_analyst', true, `metrics for ${res.publications} publication(s)`, res);
    ctx.publish({ node: 'analytics', agentId: 'instagram_analyst', status: 'passed' });
    return { passed: true };
  }
  if (node === 'approval') {
    // Handled by the engine (interrupt / decision routing).
    return { passed: true };
  }
  const spec = SPECS[node];
  if (!spec) throw new Error(`No stage spec for node '${node}'`);
  return spec.run(ctx, state);
}
