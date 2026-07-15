// apps/web/app/api/analytics/recommendations/[id]/decision/route.ts
// Accept/reject a recommendation. Source: spec/13 §14 (POST .../recommendations/:id/decision),
// spec/07 §6.2. Accepted recommendations are prioritised in the next ideation run (doc 13 §7).
import { decideRecommendation } from '@/server/analytics';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  let body: { decision?: string };
  try {
    body = (await req.json()) as { decision?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const decision = body.decision;
  if (decision !== 'accepted' && decision !== 'rejected') {
    return NextResponse.json({ error: 'decision must be accepted or rejected' }, { status: 400 });
  }
  const res = await decideRecommendation(params.id, decision);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
  return NextResponse.json({ ok: true, decision });
}
