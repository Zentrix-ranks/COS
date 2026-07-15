// apps/web/app/api/settings/route.ts
// Update Settings → Automation (doc 07 §9, doc 14 §11): budget cap, kill-switch, auto-approve.
import { updateAutomationSettings } from '@/server/settings';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  let body: {
    dailyBudgetUsd?: number;
    paused?: boolean;
    autoApprove?: { enabled: boolean; min_confidence: number; formats: string[] };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const res = await updateAutomationSettings(body);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 500 });
  return NextResponse.json({ ok: true });
}
