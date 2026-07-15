// apps/web/server/approvals.ts
// Approval service data access. Source: spec/02 §3.1 (Approval service), spec/04 §7.1
// (approvals), spec/07 §7 (Approvals queue + Asset Detail drawer).
import 'server-only';
import type { ApprovalDecision } from '@cos/shared';
import { queryAsRole, withRequestRoleClient } from './db.js';

class DecisionError extends Error {}

export interface PendingApproval {
  approval_id: string;
  asset_id: string;
  requested_at: string;
  title: string | null;
  hook: string | null;
  type: string;
  status: string;
  confidence: number | null;
  caption: string | null;
  hashtags: string[] | null;
}

export async function listPendingApprovals(): Promise<PendingApproval[] | null> {
  return queryAsRole<PendingApproval>(
    `select ap.id as approval_id, ap.asset_id, ap.requested_at,
            a.title, a.hook, a.type, a.status, a.confidence, a.caption, a.hashtags
       from approvals ap join assets a on a.id = ap.asset_id
      where ap.status = 'pending'
      order by ap.requested_at asc`,
  );
}

export interface StageRow {
  stage: string;
  status: string;
  passed: boolean | null;
  notes: string | null;
  confidence: number | null;
  agent_id: string | null;
}

export async function getAssetStageRuns(assetId: string): Promise<StageRow[]> {
  return (
    (await queryAsRole<StageRow>(
      `select stage, status, passed, notes, confidence, agent_id
         from pipeline_stage_runs where asset_id=$1 order by created_at asc`,
      [assetId],
    )) ?? []
  );
}

export interface AssetSlides {
  slides: Array<{ n: number; text: string; design_intent?: string }>;
}

export async function getAssetBody(assetId: string): Promise<AssetSlides | null> {
  const rows = await queryAsRole<{ body: AssetSlides | null }>('select body from assets where id=$1', [assetId]);
  return rows?.[0]?.body ?? null;
}

/**
 * Record an approval decision and locate the paused pipeline run to resume (doc 06 §6).
 * Returns the runId to resume, or null if none is paused.
 */
export async function recordDecision(
  approvalId: string,
  decision: ApprovalDecision,
  note: string | undefined,
): Promise<{ ok: true; runId: string | null } | { ok: false; reason: string }> {
  // Runs under the request's role (RLS): only owner/admin may update approvals (doc 04 §12).
  try {
    const result = await withRequestRoleClient(async (client) => {
      const { rows: apRows } = await client.query<{ asset_id: string; status: string }>(
        'select asset_id, status from approvals where id=$1 for update',
        [approvalId],
      );
      const ap = apRows[0];
      if (!ap) throw new DecisionError('approval not found');
      if (ap.status !== 'pending') throw new DecisionError(`already ${ap.status}`);
      const upd = await client.query<{ id: string }>(
        `update approvals set status=$1, note=$2, decided_at=now() where id=$3 returning id`,
        [decision, note ?? null, approvalId],
      );
      // RLS blocks the update for non-owner/admin roles (0 rows) → surface a clear error.
      if (upd.rowCount === 0) throw new DecisionError('not permitted (owner/admin only)');
      const { rows: runRows } = await client.query<{ id: string }>(
        `select id from runs where asset_id=$1 and status='paused' and graph='pipeline'
          order by started_at desc limit 1`,
        [ap.asset_id],
      );
      return { ok: true as const, runId: runRows[0]?.id ?? null };
    });
    if (result === null) return { ok: false, reason: 'db unavailable' };
    return result;
  } catch (err) {
    if (err instanceof DecisionError) return { ok: false, reason: err.message };
    return { ok: false, reason: (err as Error).message };
  }
}
