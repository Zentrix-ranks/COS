// apps/web/app/api/approvals/[id]/decision/route.ts
// POST an approval decision. Source: spec/02 §7 (POST /approvals/:id/decision), spec/06 §6,
// spec/07 §7. Records the decision and enqueues a resume job that re-enters the paused run.
import { recordDecision } from '@/server/approvals';
import { enqueuePipelineResume } from '@/server/queue';
import type { ApprovalDecision } from '@cos/shared';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

const VALID: ApprovalDecision[] = ['approved', 'changes_requested', 'rejected'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  let body: { decision?: string; note?: string };
  try {
    body = (await req.json()) as { decision?: string; note?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const decision = body.decision as ApprovalDecision;
  if (!VALID.includes(decision)) {
    return NextResponse.json({ error: `decision must be one of ${VALID.join(', ')}` }, { status: 400 });
  }

  const res = await recordDecision(params.id, decision, body.note);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: 409 });
  }

  let resumed = false;
  if (res.runId) {
    resumed = await enqueuePipelineResume({ runId: res.runId, decision, note: body.note });
  }
  return NextResponse.json({ ok: true, decision, resumed });
}
