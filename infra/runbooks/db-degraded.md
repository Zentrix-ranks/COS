# Runbook — Database degraded

**Owner:** Ops Lead · **Severity:** critical · Source: spec/15 §9, spec/02 §10.

## Detection
- Elevated query errors/latency; control plane read-degraded; writes failing.

## First actions
1. Check Supabase status/dashboard; identify saturation vs outage.
2. Reads: rely on the control plane's graceful fallbacks (offline states render).
3. Writes fail safe; runs pause at checkpoints (no partial side effects).
4. If needed, fail over to a read replica; for data loss, restore via PITR to the last good
   point (see disaster-recovery.md).

## Verification
- Writes succeed again; paused runs resume from checkpoint; no double publishes.
