# 15 — Deployment Guide

**Document:** 15 of 16 · **Status:** Baseline · **Owner:** Platform/DevOps

---

## 1. Purpose

How COS is built, configured, secured, deployed, observed, and operated across environments.
Complements the architecture (doc 02) and automation (doc 14).

## 2. Environments

| Env | Control plane | Workers | DB | Model spend |
|-----|---------------|---------|----|-------------|
| **local** | Next.js dev | worker process | local Postgres+pgvector (Docker) or Supabase branch | mock/cheap |
| **staging** | Vercel (preview/staging) | worker host (staging) | Supabase (staging project) | capped |
| **production** | Vercel (prod) | worker host (prod, ≥2 replicas) | Supabase (prod) | budgeted |

- Control plane on **Vercel**; long-running **workers on a persistent container host**
  (Railway/Fly/Render/etc.) because serverless can't run agent graphs (doc 02 §4).
- One Supabase project per env (Postgres + Auth + Storage), pgvector enabled.
- Redis via a managed provider (e.g., Upstash) per env.

## 3. Configuration & secrets

- **Secrets** in Vercel/worker-host secret managers + Supabase Vault; never in the repo or
  DB rows or logs (doc 08 §14). Categories: model keys (OpenRouter/Claude/OpenAI), Instagram
  token, Canva/Drive OAuth, Slack/Discord/Resend, Firecrawl/Exa/Reddit/YouTube, PostHog,
  Supabase service key, Redis URL.
- **Env vars** documented in `.env.example` (names only). A config schema (zod) validates all
  required vars at boot; missing/invalid config fails fast with a clear message.
- **Rotation:** Instagram long-lived token and OAuth tokens rotated on schedule by Tool
  Manager (doc 03 §11.5); rotation failures alert Ops.

## 4. Build & CI/CD

### 4.1 Pipeline (GitHub Actions)

```
on PR:   install → typecheck → lint → unit tests → prompt evals (fast subset) → build →
         db migration dry-run (against ephemeral DB) → preview deploy (Vercel) → e2e smoke
on main: full test suite → build → run DB migrations (staging) → deploy control plane
         (Vercel) + workers (host) → e2e smoke → manual gate → promote to production
```

- **Migrations** (doc 04 §15) run via CI (owned by Database Manager); forward-only; each has
  a rollback/backfill note; never auto-run destructive DDL without a gate.
- **Preview envs** per PR for the control plane; workers run against staging in preview.
- **Artifact parity:** the same build image/commit is promoted staging→prod.

### 4.2 Quality gates

Typecheck, lint, unit, contract tests (agent I/O), graph-simulation tests (doc 06 §13),
prompt evals (doc 09 §10), and a11y checks (doc 07 §12). A red gate blocks merge/promote.

## 5. Database operations

- **Migrations:** timestamped SQL in `packages/db/migrations`; applied in order; tracked in a
  `schema_migrations` table.
- **Backups:** Supabase automated backups + periodic logical dumps; verify restore quarterly.
- **PITR:** enable point-in-time recovery on prod.
- **Seeding:** agents (35 rows), settings defaults, KB categories, personas skeleton (doc 04
  §15). Embedding backfills run post-migrate as jobs.
- **Retention:** metrics/tool_calls pruned per `system_settings` retention keys; partition at
  volume (doc 04 §14).

## 6. Worker deployment

- Stateless worker image; scale replicas on queue depth (doc 02 §8.5).
- Graceful shutdown: stop consuming, finish/checkpoint in-flight nodes, then exit — so no run
  is lost (doc 06 §4).
- Separate worker pools optional (e.g., `publish`/`analytics`/`pipeline`) for isolation and
  independent scaling.
- Cron/repeatable jobs registered on boot (idempotent registration; stable jobIds).

## 7. Observability & ops

- **Logs:** structured JSON with correlation ids; shipped to a log store.
- **Metrics/traces:** run traces persisted (doc 04 §5) + surfaced in Run Inspector (doc 07);
  system metrics (queue depth, run success, tool status, cost burn) → System Health.
- **Product analytics:** PostHog.
- **Alerting:** thresholds (doc 14 §9) → Notification Manager → Slack/Discord/Email + Pager
  behaviour for critical.
- **Dashboards:** Operations workspace (doc 07 §6.4) is the ops single-pane; external
  dashboards optional.
- **Cost:** `cost_ledger` powers a cost dashboard; daily budget alarms (doc 02 §8.3).

## 8. Security & compliance ops

- RLS on all content/analytics/ops tables (doc 04 §12); worker uses audited service role.
- Least-privilege tool scopes (doc 08 §13); per-agent permission enforcement in runtime.
- Audit log append-only, retained long-term (doc 04 §11).
- Dependency scanning + secret scanning in CI; no secrets in artifacts.
- Regular review of platform ToS compliance for automation (publishing/scraping).

## 9. Runbooks (incident response)

| Incident | First actions |
|----------|---------------|
| Instagram publishing failing | check token/breaker (Tool Manager); reschedule; enable manual-assist; notify |
| Model provider outage | verify OpenRouter fallback; if all down, pause generation; notify |
| Budget cap hit | confirm halt; review cost_ledger for runaway agent/tool; raise cap or pause |
| Runs stuck/paused | check approvals SLA; check DLQ; resume from checkpoint; escalate |
| DB degraded | check Supabase status; failover/read-replica; pause writes; PITR if needed |
| Redis down | expect job pause; verify recovery; reconcile missed cron (doc 14 §10) |

Each runbook lives in `infra/runbooks/` and is owned by Ops Lead.

## 10. Rollback & disaster recovery

- **App rollback:** redeploy previous Vercel build / worker image (immutable artifacts).
- **Migration rollback:** apply paired down-migration/backfill; never leave partial DDL (doc
  03 §11.2).
- **DR:** documented RPO/RTO targets; restore-from-backup drill; secrets re-provisioning
  checklist.

## 11. Scaling playbook

- Workers: raise replicas + queue concurrency (respecting tool limits).
- DB: add read replicas for analytics; partition hot tables; tune vector index `ef_search`.
- Model cost: tighten routing to cheaper models on cheap stages; increase caching.

## 12. Local development

- `docker compose` for Postgres+pgvector + Redis; Supabase local optional.
- Seed script; mock model provider for cheap iteration; MCP tools in sandbox/mock mode.
- `pnpm dev` runs control plane; `pnpm worker` runs the runtime; `.env.local` from
  `.env.example`.

## 13. Release checklist (per production deploy)

- [ ] All CI gates green (types, lint, tests, evals, a11y).
- [ ] Migrations reviewed + dry-run passed; rollback noted.
- [ ] Secrets present/valid in prod (config schema passes at boot).
- [ ] Budgets/alerts configured; kill-switch verified.
- [ ] Smoke test: dashboard loads, a run executes end-to-end in staging.
- [ ] Runbooks updated for any new tool/failure mode.

## 14. Open questions

- OQ-01 Worker host of record (doc 02 OQ-01) — decide before M2.
- OQ-02 Managed Redis provider + region co-location with Supabase for latency.
- OQ-03 Log/metrics vendor (self-host vs managed) — pick per budget.

*End of document 15.*
