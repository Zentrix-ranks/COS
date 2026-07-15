# Runbook — Runs stuck / paused

**Owner:** Ops Lead · **Severity:** medium · Source: spec/15 §9, spec/06 §6/§7, spec/14 §10.

## Detection
- Runs in `paused`/`running` with no progress; approvals aging past SLA; growing DLQ.

## First actions
1. Approvals waiting on a human: `select * from v_pending_approvals;` — action or escalate.
2. Kill-switch on? `select value from system_settings where key='operation.paused';` — resume.
3. DLQ / poison jobs: check `audit_log where action='dlq'` and worker logs; fix root cause,
   re-enqueue if safe.
4. Resume from checkpoint: an approval decision (`POST /api/approvals/:id/decision`) enqueues a
   resume; the run re-enters at the approval node (idempotent side effects).

## Verification
- The run advances to `completed`/`published`; no duplicate outward actions.
