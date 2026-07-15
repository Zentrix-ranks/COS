// apps/worker/orchestrator/engine.ts
// Spec-faithful graph engine. Source: spec/06-workflow-engine.md — typed state machine (§2),
// checkpoint after every node into runs.checkpoint (§4), conditional edges + bounded revision
// loops (§5.2, §7.1), HITL interrupt → approvals row + runs.status='paused' (§6), resume by
// re-entering the approval node with the decision in state.
//
// Implementation decision ID-01 (docs/01-implementation-notes.md): doc 02/06 name LangGraph.
// This lightweight engine implements doc 06's *observable* contract exactly (Postgres
// checkpointing in runs.checkpoint, interrupt/resume, run_steps/cost). Swapping in LangGraph's
// Postgres checkpointer later is a drop-in; the node handlers and state are unchanged.
import { MAX_REVISIONS, type PipelineState } from '@cos/shared';
import type { ExecCtx } from '../agents/executor.js';
import { BudgetExceededError, isOperationPaused, OperationPausedError } from '../ops/governance.js';
import { notify } from '../notify/notify.js';
import { CAROUSEL_ORDER, type CarouselNode, runCarouselNode } from './carousel-pipeline.js';

export type PipelineOutcome =
  | { status: 'paused'; approvalId: string }
  | { status: 'held'; reason: string }
  | { status: 'completed'; decision: 'approved' | 'rejected' }
  | { status: 'failed'; error: string };

async function checkpoint(ctx: ExecCtx, state: PipelineState): Promise<void> {
  await ctx.db.query(
    `update runs set checkpoint=$1, current_node=$2, steps_used=$3, updated_at=now() where id=$4`,
    [JSON.stringify(state), state.node, state.budget.steps, ctx.runId],
  );
}

function nextNode(current: CarouselNode): CarouselNode | 'END' {
  const i = CAROUSEL_ORDER.indexOf(current);
  const next = CAROUSEL_ORDER[i + 1];
  return next ?? 'END';
}

async function setAssetStatus(ctx: ExecCtx, assetId: string, status: string): Promise<void> {
  await ctx.db.query(`update assets set status=$1, updated_at=now() where id=$2`, [status, assetId]);
}

/** Auto-approve policy (doc 12 §4.13, doc 14 §11): enabled + eligible format + confidence gate. */
async function shouldAutoApprove(ctx: ExecCtx, format: string, confidence: number): Promise<boolean> {
  const { rows } = await ctx.db.query<{ value: { enabled?: boolean; min_confidence?: number; formats?: string[] } }>(
    `select value from system_settings where key='autoapprove.policy'`,
  );
  const policy = rows[0]?.value;
  if (!policy?.enabled) return false;
  if (!(policy.formats ?? []).includes(format)) return false;
  return confidence >= (policy.min_confidence ?? 0.85);
}

/**
 * Drive the carousel pipeline from `state.node`. Returns when the run pauses at HITL approval
 * or completes. Safe to call again on resume (with state.decision set) — it re-enters at the
 * approval node without re-running prior side effects.
 */
export async function runPipeline(ctx: ExecCtx, state: PipelineState): Promise<PipelineOutcome> {
  let node = state.node as CarouselNode;

  for (;;) {
    if (state.budget.steps > 200) {
      await ctx.db.query(`update runs set status='failed', error=$1, finished_at=now() where id=$2`, [
        JSON.stringify({ reason: 'step_budget_exceeded' }),
        ctx.runId,
      ]);
      return { status: 'failed', error: 'step_budget_exceeded' };
    }

    // Kill-switch (doc 14 §8): pause holds the run at its checkpoint; it resumes when unpaused.
    if (await isOperationPaused(ctx.db)) {
      state.node = node;
      await ctx.db.query(`update runs set status='paused', current_node=$1, checkpoint=$2, updated_at=now() where id=$3`, [
        node,
        JSON.stringify(state),
        ctx.runId,
      ]);
      ctx.publish({ node, agentId: 'ops', status: 'held', verb: 'operation paused' });
      return { status: 'held', reason: 'operation_paused' };
    }

    // ---- Approval node: interrupt on first arrival, route on resume (doc 06 §6, doc 12 §4.13).
    if (node === 'approval') {
      if (!state.decision) {
        // Auto-approve is opt-in per type above a confidence floor (doc 12 §4.13, doc 14 §11):
        // if enabled, high-confidence eligible formats auto-pass; everything else interrupts
        // for a human — this is "operator approves by exception".
        if (await shouldAutoApprove(ctx, state.format, state.confidence)) {
          await ctx.db.query(
            `insert into approvals (asset_id, requested_by, status, note, decided_at)
             values ($1,'creative_director','approved','auto-approved (confidence ≥ threshold)', now())`,
            [state.assetId],
          );
          ctx.publish({ node: 'approval', agentId: 'system', status: 'auto_approved' });
          state.decision = 'approved';
          // fall through to the approved handling below
        } else {
          state.node = 'approval';
          state.needsApproval = true;
          await setAssetStatus(ctx, state.assetId, 'in_review');
          const { rows } = await ctx.db.query<{ id: string }>(
            `insert into approvals (asset_id, requested_by, status) values ($1,'creative_director','pending') returning id`,
            [state.assetId],
          );
          await ctx.db.query(`update runs set status='paused', current_node='approval', checkpoint=$1, updated_at=now() where id=$2`, [
            JSON.stringify(state),
            ctx.runId,
          ]);
          ctx.publish({ node: 'approval', agentId: 'operator', status: 'paused', verb: 'awaiting approval' });
          return { status: 'paused', approvalId: rows[0]!.id };
        }
      }
      // Resume with a decision (doc 12 §4.13 On fail routing).
      if (state.decision === 'approved') {
        // Approved → continue into scheduling → publishing → analytics (doc 12 §4.14–§4.16).
        await setAssetStatus(ctx, state.assetId, 'approved');
        await ctx.db.query(`update runs set status='running', current_node='approval', updated_at=now() where id=$1`, [ctx.runId]);
        ctx.publish({ node: 'approval', agentId: 'operator', status: 'approved' });
        node = 'scheduling';
        state.node = node;
        continue;
      }
      if (state.decision === 'rejected') {
        await setAssetStatus(ctx, state.assetId, 'archived');
        await ctx.db.query(`update runs set status='completed', current_node='approval', finished_at=now() where id=$1`, [ctx.runId]);
        ctx.publish({ node: 'approval', agentId: 'operator', status: 'rejected' });
        return { status: 'completed', decision: 'rejected' };
      }
      // changes_requested → back to draft with the operator note injected into memory (doc 06 §6).
      state.revisionCount += 1;
      delete state.decision;
      state.needsApproval = false;
      if (state.operatorNote) {
        await ctx.db.query(
          `insert into memory_episodes (agent_id, namespace, asset_id, summary, payload, outcome, importance)
           values ('brand_voice_manager','writing_style',$1,$2,$3,'neutral',0.8)`,
          [state.assetId, `Operator change request: ${state.operatorNote}`, JSON.stringify({ note: state.operatorNote })],
        );
      }
      await setAssetStatus(ctx, state.assetId, 'drafting');
      node = 'draft';
      state.node = node;
      continue;
    }

    // ---- Regular / stub / gate nodes ----
    state.node = node;
    state.budget.steps += 1;
    let passed: boolean;
    try {
      ({ passed } = await runCarouselNode(ctx, node, state));
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        // Hard stop on budget cap (doc 02 §8.3): park the run, alert the operator.
        await ctx.db.query(`update runs set status='failed', current_node=$1, checkpoint=$2, error=$3, finished_at=now() where id=$4`, [
          node,
          JSON.stringify(state),
          JSON.stringify({ reason: 'budget_exceeded', spend: err.spend, cap: err.cap }),
          ctx.runId,
        ]);
        await notify(ctx.db, {
          severity: 'critical',
          title: 'Daily budget cap hit — generation halted',
          body: `Spend $${err.spend.toFixed(4)} reached cap $${err.cap.toFixed(2)}. Review cost_ledger; raise the cap or pause.`,
          channels: ['in_app', 'slack'],
        });
        ctx.publish({ node, agentId: 'ops', status: 'failed', verb: 'budget cap' });
        return { status: 'failed', error: 'budget_exceeded' };
      }
      if (err instanceof OperationPausedError) {
        await ctx.db.query(`update runs set status='paused', current_node=$1, checkpoint=$2, updated_at=now() where id=$3`, [node, JSON.stringify(state), ctx.runId]);
        return { status: 'held', reason: 'operation_paused' };
      }
      throw err;
    }
    await checkpoint(ctx, state);

    // Bounded revision loops for quality gates (doc 06 §7.1): brand_review → draft.
    if (!passed && node === 'brand_review' && state.revisionCount < MAX_REVISIONS) {
      state.revisionCount += 1;
      node = 'draft';
      continue;
    }

    const next = nextNode(node);
    if (next === 'END') {
      await ctx.db.query(`update runs set status='completed', finished_at=now() where id=$1`, [ctx.runId]);
      return { status: 'completed', decision: 'approved' };
    }
    node = next;
  }
}
