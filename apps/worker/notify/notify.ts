// apps/worker/notify/notify.ts
// Notification Manager. Source: spec/03 §11.4 (route to in-app/Slack/Discord/email, respect
// severity), spec/04 §11 (notifications). M4 delivers in-app durably and marks external
// channels as delivered via mock adapters (real Slack/Discord/Resend land with their tools).
import type { Pool } from '@cos/db';
import type { NotificationSeverity } from '@cos/shared';

export interface NotifyArgs {
  severity: NotificationSeverity;
  title: string;
  body?: string;
  channels?: string[]; // e.g. ['in_app','slack']
  data?: Record<string, unknown>;
}

export async function notify(db: Pool, args: NotifyArgs): Promise<string> {
  const channels = args.channels ?? ['in_app'];
  // Mock delivery: in_app is always durable; external channels are marked delivered.
  const delivered: Record<string, { ok: boolean; at: string }> = {};
  for (const ch of channels) delivered[ch] = { ok: true, at: new Date().toISOString() };
  const { rows } = await db.query<{ id: string }>(
    `insert into notifications (severity, title, body, channels, data, delivered)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [args.severity, args.title, args.body ?? null, channels, JSON.stringify(args.data ?? {}), JSON.stringify(delivered)],
  );
  return rows[0]!.id;
}
