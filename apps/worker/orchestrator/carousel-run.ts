// apps/worker/orchestrator/carousel-run.ts
// Start / resume a carousel pipeline run. Source: spec/06 §5.2, §6; spec/12 §6 (carousel).
import { randomUUID } from 'node:crypto';
import type { Pool } from '@cos/db';
import type { ApprovalDecision, PipelineState } from '@cos/shared';
import type { ExecCtx } from '../agents/executor.js';
import type { ModelProvider } from '../model/provider.js';
import type { CanvaAdapter } from '../tools/canva.js';
import type { PublisherAdapter } from '../tools/instagram.js';
import { type PipelineOutcome, runPipeline } from './engine.js';

export interface PipelineDeps {
  db: Pool;
  provider: ModelProvider;
  tools: { canva: CanvaAdapter; instagram: PublisherAdapter };
  publish: (evt: { runId: string; node: string; agentId: string; status: string; verb?: string }) => void;
}

function execCtx(deps: PipelineDeps, runId: string): ExecCtx {
  return {
    db: deps.db,
    provider: deps.provider,
    runId,
    tools: deps.tools,
    publish: (evt) => deps.publish({ runId, ...evt }),
  };
}

export interface StartCarouselArgs {
  title: string;
  angle?: string | null;
  ideaId?: string | null;
}

export async function startCarousel(deps: PipelineDeps, args: StartCarouselArgs): Promise<PipelineOutcome & { runId: string; assetId: string }> {
  const { db } = deps;
  // Create the asset (doc 04 §6.2) in 'drafting'.
  const { rows: assetRows } = await db.query<{ id: string }>(
    `insert into assets (idea_id, type, status, title, created_by)
     values ($1,'carousel','drafting',$2,'creative_director') returning id`,
    [args.ideaId ?? null, args.title],
  );
  const assetId = assetRows[0]!.id;

  const { rows: runRows } = await db.query<{ id: string }>(
    `insert into runs (graph, asset_id, status, current_node, step_budget)
     values ('pipeline',$1,'running','idea_generation',200) returning id`,
    [assetId],
  );
  const runId = runRows[0]!.id;

  const state: PipelineState = {
    assetId,
    ideaId: args.ideaId ?? null,
    ideaTitle: args.title,
    ideaAngle: args.angle ?? null,
    format: 'carousel',
    node: 'idea_generation',
    asset: { title: args.title },
    checks: {},
    confidence: 1,
    needsApproval: false,
    revisionCount: 0,
    memoryUsed: [],
    budget: { steps: 0 },
    correlationId: randomUUID(),
  };

  const outcome = await runPipeline(execCtx(deps, runId), state);
  return { ...outcome, runId, assetId };
}

export async function resumeCarousel(
  deps: PipelineDeps,
  args: { runId: string; decision: ApprovalDecision; note?: string | undefined },
): Promise<PipelineOutcome | { status: 'skipped'; reason: string }> {
  const { db } = deps;
  const { rows } = await db.query<{ checkpoint: PipelineState | null; status: string }>(
    `select checkpoint, status from runs where id=$1`,
    [args.runId],
  );
  const run = rows[0];
  if (!run) return { status: 'skipped', reason: 'run not found' };
  if (run.status !== 'paused' || !run.checkpoint) return { status: 'skipped', reason: `run not paused (${run.status})` };

  const state = run.checkpoint;
  state.decision = args.decision;
  if (args.note !== undefined) state.operatorNote = args.note;
  state.node = 'approval';

  await db.query(`update runs set status='running', updated_at=now() where id=$1`, [args.runId]);
  return runPipeline(execCtx(deps, args.runId), state);
}
