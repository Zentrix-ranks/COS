# 01 — Implementation Notes

**Status:** Living · **Owner:** Engineering
**Rule of the house (spec/00-index.md §0.1):** update the spec first, then the code.

This document tracks implementation progress against the specification and records any spec
corrections discovered while building. It complements — it does not replace — the spec.

---

## M0 — Foundations (in progress)

Target (spec/01-vision-and-prd.md §12, spec/16-claude-code-master-build-prompt.md §6 M0):
repo structure, DB schema & migrations with the agent seed rows, auth/roles/RLS, Redis/BullMQ
wiring, a worker that runs a no-op agent end-to-end, MCP guard scaffold, observability plumbing,
and a Mission Control shell rendering live-ish status.

### What this slice delivers

| Area | Deliverable | Spec trace | Status |
|------|-------------|-----------|--------|
| Monorepo | `apps/*`, `packages/*`, `infra/` layout; npm workspaces; shared `tsconfig.base.json` | doc 02 §11 | ✅ done |
| DB schema | 13 forward-only migrations (`packages/db/migrations`), full schema + enums + RLS + views | doc 04 §3–§13 | ✅ done, migrates clean |
| Agent seed | 36 agent contracts (`packages/db/seed/agents.json`, canonical from Appendix A2) + `system_settings` defaults | doc 03, doc 04 §5.1/§15, A2 | ✅ done, seeds clean & idempotent |
| Shared types | Postgres enums as TS/zod (`@cos/shared`), doc-10 message envelope, queue/channel names | doc 04 §3, doc 10 §3 | ✅ done, typechecks |
| Control-plane shell | Next.js App Router Mission Control screen (KPIs, departments, running agents, task queue, notifications) | doc 07 §5 | ✅ builds; placeholder data |
| Agent runtime | BullMQ worker consuming the `runs` queue; **no-op agent** writes a run + run_step and publishes realtime status | doc 02 §3.2/§5, doc 16 §6 M0 | ✅ code + typechecks |
| Tool guard | MCP permission-gate seam every tool call passes through | doc 02 §6.3, doc 08 §2/§13 | ✅ scaffold |

### Verified locally

- **Migrations + seed run end-to-end** against Postgres 16 + pgvector 0.6 (ephemeral cluster).
  Result: 36 base tables, 3 `v_*` views, 15 enum types, 7 departments; **36 agents**
  (1 executive + 6 managers + 29 specialists); 0 dangling `reports_to` (referential
  integrity holds); seed is idempotent (re-running keeps 36 rows).
- **Typecheck** passes for `@cos/shared`, `@cos/db`, `@cos/worker`, `@cos/web`.
- **`next build`** compiles and prerenders Mission Control.

### Not yet done in M0 (needs provisioned infra to reach the M0 Definition of Done)

The M0 DoD ("a no-op run appears live on the dashboard; CI green") requires a running
Supabase project, Redis, and a deploy target, which are not provisioned in this environment.
Remaining M0 work:

- Wire Mission Control regions to the DB views (`v_today_progress`, `v_running_agents`,
  `v_pending_approvals`) and the realtime SSE bridge over Redis pub/sub (doc 02 §3.1).
- Auth (Supabase) + session wiring in the control plane (doc 02 §8.1).
- CI pipeline (lint + typecheck + migrate on a throwaway DB) — doc 15.
- Cost/observability tables are present (`cost_ledger`, `run_steps`); wire the executor to
  write them once real agents land (M1).

---

## Spec corrections discovered (propose as PRs to the spec — doc 16 §3 "spec-first")

Per the operating rule, these are logged here and should be amended in the spec docs.

### SC-01 — Agent count is 36, not 35

doc 03 §2 states "1 CEO + 6 department heads + 28 specialists = **35 agents**", but the org
chart in the same section and the canonical seed in Appendix A2 both enumerate **29
specialists → 36 agents** (verified: seed loads 1 executive + 6 managers + 29 specialists).
Recommend correcting doc 03 §2 to "29 specialists = 36 agents" and updating the "35 agent
seed rows" phrasing in doc 04 §15 and doc 16 §6 (M0) to 36. The seed loads all 36 from A2
(the canonical source) rather than dropping one to match the stale total.

### SC-02 — `window` is a reserved word (metrics, clusters)

doc 04 §8.1 (`metrics`) and §8.3 (`clusters`) define a column `window text ...`. `window` is
a reserved keyword in PostgreSQL and fails unquoted (`syntax error at or near "window"`). The
migrations quote it as `"window"`. Recommend the spec DDL show `"window"` (and note that
queries must quote it), or rename the column (e.g. `metric_window`) if a rename is preferred.

---

## Local development note (Supabase objects)

The schema references Supabase-provided objects: `auth.users` (profiles FK, doc 04 §4.1) and
`auth.role()` (RLS policies, doc 04 §12). On Supabase these exist. For a plain-Postgres local
DB, apply `packages/db/local-dev-shim.sql` before migrating. See `packages/db/README.md`.
