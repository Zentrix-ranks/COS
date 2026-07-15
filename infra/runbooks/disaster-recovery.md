# Disaster recovery (DR)

**Owner:** Ops Lead · Source: spec/15 §10.

## Targets
- **RPO** (max data loss): ≤ 24h via daily backups; ≤ 5 min where PITR is enabled.
- **RTO** (max downtime): control plane ≤ 30 min (redeploy previous immutable build);
  workers ≤ 30 min (redeploy previous image).

## App rollback
- Redeploy the previous Vercel build and previous worker image (immutable artifacts). No code
  change required — artifacts are versioned.

## Migration rollback
- Migrations are forward-only; to revert, apply a paired down-migration/backfill. Never leave
  partial DDL. Verify `schema_migrations` reflects the intended state.

## Restore-from-backup drill (run quarterly)
1. Provision a scratch Postgres; restore the latest backup (or PITR to a chosen timestamp).
2. Point a staging worker/control plane at it; run `ops.healthcheck` and a no-op run.
3. Confirm counts (agents=36, recent runs/publications) and that exactly-once constraints hold.

## Secrets re-provisioning checklist
- DB URLs, Supabase keys, Redis URL, OpenRouter/Anthropic/OpenAI keys, IG token, Canva OAuth,
  PostHog key. Re-issue from the vault; rotate any exposed during the incident; never commit.
