// packages/shared/src/envelope.ts
// The agent-communication message envelope. Source: spec/10-agent-communication-protocol.md
// §3 (envelope) + §2 (typed, auditable, idempotent, loop-safe via hop/correlation_id).
import { z } from 'zod';

export const MESSAGE_TYPES = [
  'task.assign',
  'task.result',
  'request.info',
  'info.response',
  'review.request',
  'review.result',
  'escalate',
  'notify',
  'status',
] as const;

export const zMessageType = z.enum(MESSAGE_TYPES);
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Max relays before an envelope is treated as a loop and killed (doc 10 §2 loop-safe). */
export const MAX_HOP = 12;

export const zEnvelope = z.object({
  id: z.string().uuid(),
  correlation_id: z.string().uuid(), // one work thread across many messages
  causation_id: z.string().uuid().nullable(), // the message that caused this one
  type: zMessageType,
  from: z.string(), // agent id
  to: z.string(), // agent id or role/channel
  subject: z.string(),
  payload: z.record(z.unknown()).default({}), // typed per message type
  confidence: z.number().min(0).max(1).optional(), // for results
  priority: z.number().int().default(100), // lower = sooner
  hop: z.number().int().min(0).max(MAX_HOP), // increments each relay (loop guard)
  deadline: z.string().datetime().nullable().default(null),
  created_at: z.string().datetime(),
});

export type Envelope = z.infer<typeof zEnvelope>;

/** True if relaying this envelope once more would exceed the loop guard. */
export function wouldLoop(env: Pick<Envelope, 'hop'>): boolean {
  return env.hop + 1 > MAX_HOP;
}
