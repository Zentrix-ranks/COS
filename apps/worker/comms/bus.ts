// apps/worker/comms/bus.ts
// Agent communication protocol. Source: spec/10 — envelope (§3), channel routing + rejection
// of rogue cross-talk (§5), delegation creates tasks with parent_task (§6.1), messages share
// correlation_id with runs (§7). Messages are persisted to the `messages` table (§5.1 step 3).
import { randomUUID } from 'node:crypto';
import type { Pool } from '@cos/db';
import { MAX_HOP, type MessageType } from '@cos/shared';

interface AgentRow {
  id: string;
  tier: string;
  department: string;
  channels: { in?: string[]; out?: string[] };
}

async function loadAgentRow(db: Pool, id: string): Promise<AgentRow> {
  const { rows } = await db.query<AgentRow>(`select id, tier, department, channels from agents where id=$1`, [id]);
  const a = rows[0];
  if (!a) throw new Error(`Agent '${id}' not found`);
  return a;
}

/** Channel-permission check (doc 10 §5): out must permit the target, by id, role, or dept. */
function channelAllows(out: string[], to: AgentRow | 'operator'): boolean {
  if (to === 'operator') return out.includes('operator');
  if (out.includes(to.id)) return true;
  if (out.includes('department_heads') && to.tier === 'manager') return true;
  if (out.includes(to.department)) return true;
  return false;
}

export interface SendArgs {
  from: string;
  to: string; // agent id (roles resolved by caller for M4)
  type: MessageType;
  subject: string;
  payload?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
  causationId?: string | undefined;
  confidence?: number | undefined;
  hop?: number | undefined;
  taskId?: string | undefined;
}

/** Validate + persist a message. Returns the message id. Throws on channel/hop violation. */
export async function sendMessage(db: Pool, args: SendArgs): Promise<{ messageId: string; correlationId: string }> {
  const hop = args.hop ?? 0;
  if (hop > MAX_HOP) throw new Error(`message hop ${hop} exceeds MAX_HOP ${MAX_HOP} (loop guard)`);
  const from = await loadAgentRow(db, args.from);
  const target = args.to === 'operator' ? 'operator' : await loadAgentRow(db, args.to);
  if (!channelAllows(from.channels.out ?? [], target)) {
    throw new Error(`channel violation: ${args.from} may not send to ${args.to} (out=${JSON.stringify(from.channels.out)})`);
  }
  const correlationId = args.correlationId ?? randomUUID();
  const { rows } = await db.query<{ id: string }>(
    `insert into messages (correlation_id, causation_id, type, from_agent, to_agent, subject, payload, confidence, hop, task_id, status, delivered_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'delivered', now()) returning id`,
    [correlationId, args.causationId ?? null, args.type, args.from, args.to, args.subject, JSON.stringify(args.payload ?? {}), args.confidence ?? null, hop, args.taskId ?? null],
  );
  return { messageId: rows[0]!.id, correlationId };
}

/** Delegation (doc 10 §6.1): a manager assigns work to a subordinate; creates a task. */
export async function delegate(
  db: Pool,
  args: { from: string; to: string; subject: string; payload?: Record<string, unknown>; correlationId?: string; parentTask?: string },
): Promise<{ taskId: string; messageId: string; correlationId: string }> {
  const { rows } = await db.query<{ id: string }>(
    `insert into tasks (title, agent_id, parent_task, status, payload) values ($1,$2,$3,'queued',$4) returning id`,
    [args.subject, args.to, args.parentTask ?? null, JSON.stringify(args.payload ?? {})],
  );
  const taskId = rows[0]!.id;
  const sent = await sendMessage(db, {
    from: args.from,
    to: args.to,
    type: 'task.assign',
    subject: args.subject,
    payload: args.payload ?? {},
    correlationId: args.correlationId,
    taskId,
  });
  return { taskId, messageId: sent.messageId, correlationId: sent.correlationId };
}
