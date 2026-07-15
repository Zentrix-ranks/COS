# 14 — Automation & Scheduling Specification

**Document:** 14 of 16 · **Status:** Baseline · **Owner:** Platform Engineering

---

## 1. Purpose

COS should run itself. This document defines the automations that make it autonomous: the
**daily loop**, the cron schedule, the queue/job system (Redis + BullMQ), triggers,
concurrency, idempotency, and how automation stays safe (budgets, HITL, kill-switch).

## 2. The daily loop

The founding "every morning" sequence, made concrete:

```
Check trends → Check competitors → Update audience interests → Generate content ideas →
Prioritize ideas → Generate drafts → Request approval if needed → Schedule approved content →
Publish → Collect analytics → Learn
```

Realised as the `ceo` graph kickoff (doc 06 §5.1), decomposed into scheduled jobs:

| Step | Job | Owner agent(s) |
|------|-----|----------------|
| Check trends | `daily.trends` | trend_researcher |
| Check competitors | `daily.competitors` | competitor_analyst |
| Update audience | `daily.audience` | audience_researcher |
| Generate + prioritize ideas | `daily.ideation` | cso, creative_director |
| Generate drafts | `daily.draft` (fan-out) | creative dept (pipeline) |
| Request approval | (HITL interrupts) | operator |
| Schedule approved | `daily.schedule` | scheduler |
| Publish (at slot times) | `publish.fire` (per schedule) | cross_platform_publisher |
| Collect analytics | `analytics.collect` | instagram_analyst |
| Learn | `analytics.learn` | recommendation_engine, memory_manager |

## 3. Schedule (cron)

Times are in the operator's timezone (`system_settings.timezone`). Representative defaults:

| Cron | Job | Notes |
|------|-----|-------|
| `0 6 * * *` | `daily.kickoff` | starts trends→competitors→audience→ideation→draft |
| `0 8 * * *` | `approvals.digest` | notify operator of pending approvals |
| `*/15 * * * *` | `publish.tick` | fire any schedules due now (idempotent) |
| `0 * * * *` | `analytics.collect` | hourly metric pull |
| `30 5 * * *` | `analytics.learn` | recluster + patterns + recommendations |
| `0 5 * * *` | `kb.refresh_freshness` | prop-firm rules, competitor DB, analytics history |
| `0 9 * * 1` | `analytics.weekly_report` | Monday weekly report |
| `*/5 * * * *` | `ops.healthcheck` | tools/queues/budgets health |
| `0 2 * * *` | `memory.compact` | decay/compaction (doc 05) |

Cron is owned by `automation_manager` (doc 03 §9.5) and configurable in Settings → Automation
(doc 07 §9). Auto-approve policy + confidence thresholds also live there.

## 4. Job system (Redis + BullMQ)

- **Queues:** `pipeline`, `publish`, `analytics`, `research`, `notify`, `memory`, `ops`.
- **Producers:** control plane (user actions), cron scheduler, and agents (via
  `queue.enqueue`).
- **Consumers:** worker processes (doc 02 §3.2), concurrency tuned per queue and per tool
  rate limit.
- **Job options:** attempts + exponential backoff, `removeOnComplete`/`removeOnFail` limits,
  `jobId` for idempotency (dedupe), priority, delay (for scheduled publishes).
- **Repeatable jobs:** BullMQ repeatable jobs back the cron entries (survives restarts).
- **Dead-letter:** exhausted jobs move to a DLQ + alert (doc 06 §7).

### 4.1 Publishing at the right time

`scheduler` writes `schedules.scheduled_at`; a `publish.tick` cron (or a delayed job per
schedule) enqueues `publish.fire` at the slot. `publish.fire` is **idempotent** (idempotency
key = `asset_id:platform`) so ticks can overlap safely and never double-post (doc 04 §7.3).

## 5. Triggers (beyond cron)

- **Event triggers:** approval decisions (resume run), new metrics (score), tool outage
  (breaker + degrade), budget cap (halt generation).
- **Reactive trend trigger:** a high-momentum trend can trigger an off-cycle fast-track
  pipeline run (doc 12 §7 reactive SLA).
- **Manual triggers:** operator actions from the UI/command palette ("run today's ideation",
  "generate weekly report now", "pause operation").

## 6. Concurrency, ordering & backpressure

- Pipeline fan-out bounded (default 6 concurrent assets, doc 06 §9).
- Per-tool token buckets (doc 08 §2.1) throttle research/publish/model calls to provider
  limits; queues apply backpressure rather than overrun.
- No global ordering guarantee; correctness comes from run state + idempotency, not order.

## 7. Idempotency & exactly-once (automation-level)

- Every scheduled/enqueued outward action carries an idempotency key.
- Repeatable jobs use stable `jobId`s so duplicate schedules don't stack.
- Publish uniqueness enforced at the DB (doc 04 §7.3) as the last line of defense.

## 8. Safety & governance

- **Budgets:** daily $ cap (`system_settings.budget.daily_usd`) enforced across all jobs;
  on breach, generation halts, publishing of already-approved content may continue, operator
  alerted (doc 02 §8.3).
- **HITL preserved:** automation never removes the human option; auto-approve is bounded by
  policy + confidence (doc 12 §4.13).
- **Kill-switch:** `ceo`/`ops_lead`/operator can **pause the operation** — cron continues to
  fire but jobs short-circuit to "paused"; in-flight runs checkpoint and hold (doc 06).
- **Quiet hours:** notifications respect quiet hours; critical alerts override (doc 03 §11.4).
- **Rate & spend alarms:** thresholds page the operator before caps are hit.

## 9. Observability of automation

- Every cron firing and job is recorded (success/fail/duration); surfaced in Operations →
  Automation and System Health (docs 07/03).
- Metrics: missed triggers, job success rate, queue depth, DLQ size, schedule adherence,
  publish on-time rate.
- Alerts on missed daily kickoff, growing DLQ, or publish failures.

## 10. Failure & recovery

| Failure | Behaviour |
|---------|-----------|
| Worker crash mid-job | job re-queued; run resumes from checkpoint; idempotent side effects |
| Redis outage | cron/jobs pause; control plane serves reads; recover on reconnect |
| Missed cron (host down) | on recovery, `automation_manager` reconciles: run missed critical jobs (idempotent), skip stale ones |
| Publish slot missed | reschedule to next best slot + notify (never silently drop) |

## 11. Configuration surface

All in Settings → Automation (doc 07 §9), backed by `system_settings`:

- daily kickoff time & timezone; per-job enable/disable & cron overrides;
- auto-approve policy (which asset types) + confidence thresholds;
- daily budget cap + alert thresholds; quiet hours; fan-out concurrency;
- reactive-trend trigger sensitivity.

## 12. Open questions

- OQ-01 Delayed-job-per-schedule vs periodic tick for publishing — tick is simpler/robust;
  default to `*/15` tick + idempotency. Revisit for minute-precise slots.
- OQ-02 Should reactive trends auto-run the full pipeline or only draft-then-HITL? (v1:
  draft-then-HITL for safety.)
- OQ-03 Catch-up policy for long outages (which missed jobs to replay) — codify per job.

*End of document 14.*
