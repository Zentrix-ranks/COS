# 10 — Agent Communication Protocol

**Document:** 10 of 16 · **Status:** Baseline · **Owner:** Agent Engineering

---

## 1. Purpose

Agents are a company; a company needs a mail system. This document defines how agents talk:
the message envelope, channels, routing, delegation, escalation, acknowledgements, and how
messages relate to tasks and runs. It makes inter-agent communication typed, auditable, and
replayable.

## 2. Design goals

- **Typed & validated** — every message conforms to a schema (zod).
- **Auditable** — every message is persisted (`messages` table) and traceable to a run.
- **Idempotent** — duplicate deliveries are safe.
- **Loop-safe** — envelopes carry hop counts and correlation ids to detect/kill loops.
- **Decoupled** — senders address channels/roles, not process handles.

## 3. Message envelope

```jsonc
{
  "id": "uuid",
  "correlation_id": "uuid",         // one work thread across many messages
  "causation_id": "uuid|null",      // the message that caused this one
  "type": "task.assign | task.result | request.info | info.response |
           review.request | review.result | escalate | notify | status",
  "from": "creative_director",      // agent id
  "to": "hook_writer",              // agent id or role/channel
  "subject": "string",
  "payload": { /* typed per message type */ },
  "confidence": 0.0,                 // for results
  "priority": 100,                   // lower = sooner
  "hop": 2,                          // increments each relay (loop guard)
  "deadline": "timestamptz|null",
  "created_at": "timestamptz"
}
```

Stored in a `messages` table (extends doc 04):

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  causation_id uuid,
  type text not null,
  from_agent text references agents(id),
  to_target text not null,           -- agent id or channel/role
  subject text,
  payload jsonb not null default '{}',
  confidence numeric(4,3),
  priority int not null default 100,
  hop int not null default 0,
  deadline timestamptz,
  run_id uuid references runs(id),
  status text not null default 'sent', -- sent|delivered|acked|failed
  created_at timestamptz not null default now()
);
create index on messages (correlation_id, created_at);
create index on messages (to_target, status);
```

## 4. Message types

| Type | Meaning | Typical payload |
|------|---------|-----------------|
| `task.assign` | delegate work down the hierarchy | brief, inputs, deadline |
| `task.result` | return completed work up | output, confidence |
| `request.info` | ask a peer/specialist for data | question, context |
| `info.response` | answer a request | data, citations |
| `review.request` | ask a reviewer (brand/QA) to check | artifact |
| `review.result` | reviewer verdict | pass/fail, fixes |
| `escalate` | push a decision/problem upward | reason, options |
| `notify` | fire-and-forget signal | event, severity |
| `status` | live status heartbeat | verb, progress |

## 5. Channels & routing

- **Hierarchical channels** mirror the org chart (doc 03): each agent has `channels.in`
  (who it accepts from) and `channels.out` (who it sends to). The router rejects messages
  that violate the declared channels (prevents rogue cross-talk).
- **Role channels:** some targets are roles/departments (e.g., `to: "design"`) resolved to
  the department head, who fans out.
- **Broadcast channels:** `notify` messages can target operator channels via Notification
  Manager (doc 03 §11.4).

### 5.1 Routing rules

1. Validate envelope (schema + channel permission + hop < max).
2. Resolve `to` (agent id or role → agent).
3. Enqueue delivery (BullMQ) with `priority`; persist `messages` row.
4. On delivery, the recipient's executor consumes it as a task input (§7).
5. Record `delivered`/`acked` status; unacked past deadline → retry/escalate.

## 6. Delegation & escalation

### 6.1 Delegation (downward)

A manager sends `task.assign` to specialists; each becomes a `task` (doc 04 §5.2) with
`parent_task` set, forming a delegation tree. Results (`task.result`) bubble up; the manager
aggregates and reviews before reporting further up.

### 6.2 Escalation (upward) — the ladder

```
specialist ─ escalate ─► department head ─ escalate ─► CEO ─ escalate ─► Operator (HITL)
```

Triggers: exhausted retries, confidence below threshold, cross-department conflict, budget
breach, brand/compliance risk, or explicit policy. Escalations carry `reason` + `options` so
the receiver can decide fast. Operator escalations become approvals/notifications (docs 06/07).

## 7. Relationship to tasks & runs

- An inbound `task.assign` creates/updates a `task`; running it spawns/continues a `run`
  (doc 06). Messages and runs share `correlation_id` so the whole thread is reconstructable.
- `task.result` closes the task and may trigger the next graph node.
- The Run Inspector (doc 07) can render the message thread alongside the run timeline.

## 8. Acknowledgement, delivery & ordering

- **At-least-once delivery** via the queue; recipients dedupe by `message.id` (idempotent).
- **Acks:** recipient marks `acked` when accepted; producer can require ack for critical
  types (`task.assign`, `review.request`).
- **Ordering:** not globally guaranteed; where order matters, use `causation_id` chains and
  state in the run rather than message order.
- **Deadlines:** unmet deadlines trigger retry then escalation.

## 9. Loop & storm protection

- **Hop limit:** `hop` increments on each relay; exceeding `max_hops` (default 12) drops the
  message and escalates — prevents infinite ping-pong.
- **Correlation budgets:** a `correlation_id` has a max message/step budget; exceeding it
  parks the thread and alerts Ops.
- **Rate limiting:** per-sender message rate is bounded; bursts are shed with backpressure.
- **Circuit breakers:** if a recipient is failing, its channel breaker opens and senders
  degrade/escalate instead of flooding.

## 10. Security & trust boundaries

- Agents may only send on declared channels; violations are denied + audited.
- Payloads that include externally-fetched content mark it as **untrusted data**; recipients
  must not execute instructions embedded in it (doc 09 §9 injection defense).
- No agent can spoof `from`: the router sets `from` from the authenticated executor identity.

## 11. Observability

- Every message persisted; threads viewable by `correlation_id`.
- Metrics: message volume by type, ack latency, escalation rate, loop-kills, dead-letters.
- These feed System Health (doc 03 §11.6) and the analytics of the org itself.

## 12. Example thread (carousel creation)

```
ceo ──task.assign──► creative_director        (subject: "Make today's carousels")
creative_director ──task.assign──► hook_writer (idea #44)
hook_writer ──task.result──► creative_director (chosen_hook, conf 0.82)
creative_director ──task.assign──► carousel_writer (idea #44 + hook)
carousel_writer ──review.request──► brand_voice_manager (draft)
brand_voice_manager ──review.result──► carousel_writer (pass, minor fixes)
carousel_writer ──task.result──► creative_director (slides, conf 0.79)
creative_director ──task.assign──► design_lead (approved copy)
… (design → visual_qa → approval interrupt → publishing)
```

All share one `correlation_id`; the whole story is replayable.

## 13. Open questions

- OQ-01 Do we need a pub/sub topic bus in addition to point-to-point for broadcast events?
  (v1: point-to-point + Notification Manager broadcast; revisit.)
- OQ-02 Max hops (12) and correlation budget defaults — tune in staging.
- OQ-03 Should `status` heartbeats persist to `messages` or only to realtime? (v1: realtime
  only + last-status on run_step to avoid table bloat.)

*End of document 10.*
