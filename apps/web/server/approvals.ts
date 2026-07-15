// apps/web/server/approvals.ts
// Approval service data access. Source: spec/02 §3.1 (Approval service), spec/04 §7.1
// (approvals), spec/07 §7 (Approvals queue + Asset Detail drawer).
import 'server-only';
import type { ApprovalDecision } from '@cos/shared';
import { getPool } from './db.js';

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
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<PendingApproval>(
      `select ap.id as approval_id, ap.asset_id, ap.requested_at,
              a.title, a.hook, a.type, a.status, a.confidence, a.caption, a.hashtags
         from approvals ap join assets a on a.id = ap.asset_id
        where ap.status = 'pending'
        order by ap.requested_at asc`,
    );
    return rows;
  } catch {
    return null;
  }
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
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query<StageRow>(
      `select stage, status, passed, notes, confidence, agent_id
         from pipeline_stage_runs where asset_id=$1 order by created_at asc`,
      [assetId],
    );
    return rows;
  } catch {
    return [];
  }
}

export interface AssetSlides {
  slides: Array<{ n: number; text: string; design_intent?: string }>;
}

export async function getAssetBody(assetId: string): Promise<AssetSlides | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<{ body: AssetSlides | null }>('select body from assets where id=$1', [assetId]);
    return rows[0]?.body ?? null;
  } catch {
    return null;
  }
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
  const p = getPool();
  if (!p) return { ok: false, reason: 'db unavailable' };
  const client = await p.connect();
  try {
    await client.query('begin');
    const { rows: apRows } = await client.query<{ asset_id: string; status: string }>(
      'select asset_id, status from approvals where id=$1 for update',
      [approvalId],
    );
    const ap = apRows[0];
    if (!ap) {
      await client.query('rollback');
      return { ok: false, reason: 'approval not found' };
    }
    if (ap.status !== 'pending') {
      await client.query('rollback');
      return { ok: false, reason: `already ${ap.status}` };
    }
    await client.query(
      `update approvals set status=$1, note=$2, decided_at=now() where id=$3`,
      [decision, note ?? null, approvalId],
    );
    const { rows: runRows } = await client.query<{ id: string }>(
      `select id from runs where asset_id=$1 and status='paused' and graph='pipeline'
        order by started_at desc limit 1`,
      [ap.asset_id],
    );
    await client.query('commit');
    return { ok: true, runId: runRows[0]?.id ?? null };
  } catch (err) {
    await client.query('rollback');
    return { ok: false, reason: (err as Error).message };
  } finally {
    client.release();
  }
}
