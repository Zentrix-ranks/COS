# Runbook — Redis down

**Owner:** Ops Lead · **Severity:** high · Source: spec/15 §9, spec/14 §10.

## Detection
- BullMQ enqueue/consume failing; realtime SSE shows "offline"; cron not firing.

## First actions
1. Expect job pause: the control plane still serves reads; workers idle safely.
2. Restore/reconnect Redis (managed: check Upstash/provider; self-hosted: restart).
3. On recovery, `automation_manager` reconciles missed cron: run missed critical jobs
   (idempotent — publish/collect/learn), skip stale ones (doc 14 §10).

## Verification
- Cron repeatables re-register on worker start; a manual `ops.healthcheck` writes a snapshot;
  realtime returns to "live".
