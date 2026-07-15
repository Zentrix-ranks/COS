// apps/worker/orchestrator/carousel-run.ts
// Start / resume a carousel pipeline run. Source: spec/06 §5.2, §6; spec/12 §6 (carousel).
import { randomUUID } from 'node:crypto';
import type { Pool } from '@cos/db';
import type { ApprovalDecision, AssetType, PipelineState } from '@cos/shared';
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

export interface StartPipelineArgs {
  format: AssetType;
  title: string;
  angle?: string | null;
  ideaId?: string | null;
  correlationId?: string;
}

/** Frame/slide count target per format (doc 12 §6 format variations). */
function unitsFor(format: AssetType): number {
  switch (format) {
    case 'carousel':
      return 7;
    case 'reel':
    case 'short':
      return 5;
    case 'story':
    case 'thread':
      return 3;
    default:
      return 1; // image, caption
  }
}

export async function startPipeline(deps: PipelineDeps, args: StartPipelineArgs): Promise<PipelineOutcome & { runId: string; assetId: string }> {
  const { db } = deps;
  const { rows: assetRows } = await db.query<{ id: string }>(
    `insert into assets (idea_id, type, status, title, created_by)
     values ($1,$2,'drafting',$3,'creative_director') returning id`,
    [args.ideaId ?? null, args.format, args.title],
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
    format: args.format,
    node: 'idea_generation',
    asset: { title: args.title },
    checks: {},
    confidence: 1,
    needsApproval: false,
    revisionCount: 0,
    memoryUsed: [],
    budget: { steps: 0, units: unitsFor(args.format) },
    correlationId: args.correlationId ?? randomUUID(),
  };

  const outcome = await runPipeline(execCtx(deps, runId), state);
  return { ...outcome, runId, assetId };
}

/** Carousel convenience wrapper (M1 job entry point). */
export function startCarousel(deps: PipelineDeps, args: { title: string; angle?: string | null; ideaId?: string | null }) {
  return startPipeline(deps, { format: 'carousel', ...args });
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
