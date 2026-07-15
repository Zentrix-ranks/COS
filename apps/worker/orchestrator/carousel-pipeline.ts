// apps/worker/orchestrator/carousel-pipeline.ts
// The carousel pipeline graph (M1: Idea → … → Approval). Source: spec/06 §5.2 (pipeline graph),
// spec/12 §4 (stages) + §6 (carousel variation). Design/Thumbnail/Visual-QA are stubs here
// (Canva lands in M2, doc 16 §6). CTA is produced by cta_specialist as a sub-step of Draft
// (there is no `cta` pipeline_stage enum value — doc 04 §3).
import type { CreativeStageKey, PromptContext } from '@cos/prompts';
import type { PipelineState } from '@cos/shared';
import { type ExecCtx, runStage, type StageSpec } from '../agents/executor.js';

const SLIDES = 7;
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
    slides: SLIDES,
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

/** Ordered node list for the M1 carousel path. `cta` and `visual_qa` are sub/gate nodes. */
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
] as const;

export type CarouselNode = (typeof CAROUSEL_ORDER)[number];

/** Run one node; returns pass/fail (gates) or true for non-gate/stub nodes. */
export async function runCarouselNode(ctx: ExecCtx, node: CarouselNode, state: PipelineState): Promise<{ passed: boolean }> {
  // Stub nodes (M2 wires Canva). They record a pipeline_stage_run so the Asset Detail drawer
  // shows the full path (doc 07 §7.1); Visual QA is a gate with no enum stage.
  if (node === 'design' || node === 'thumbnail') {
    await ctx.db.query(
      `insert into pipeline_stage_runs (asset_id, stage, status, agent_id, notes, passed, started_at, finished_at)
       values ($1,$2,'skipped',$3,'stub — Canva design lands in M2 (doc 16 §6)', true, now(), now())`,
      [state.assetId, node, node === 'design' ? 'design_lead' : 'thumbnail_creator'],
    );
    ctx.publish({ node, agentId: node === 'design' ? 'design_lead' : 'thumbnail_creator', status: 'skipped' });
    return { passed: true };
  }
  if (node === 'visual_qa') {
    ctx.publish({ node: 'visual_qa', agentId: 'visual_qa', status: 'passed' });
    state.checks.design = { stage: 'design', passed: true, notes: 'visual QA stub passed (M1)' };
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
