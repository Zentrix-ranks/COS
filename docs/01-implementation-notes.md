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
| Control-plane shell | Next.js App Router Mission Control screen (KPIs, departments, running agents, task queue, notifications) reading live DB views with graceful offline fallback | doc 07 §5, §5.3 | ✅ live reads |
| Realtime | SSE bridge (`/api/stream`) over Redis pub/sub + client refresher that refetches on worker events | doc 02 §3.1/§5, doc 07 §5.2 | ✅ done |
| Agent runtime | BullMQ worker consuming the `runs` queue; **no-op agent** writes a run + run_step and publishes realtime status | doc 02 §3.2/§5, doc 16 §6 M0 | ✅ runs end-to-end |
| Tool guard | MCP permission-gate seam every tool call passes through | doc 02 §6.3, doc 08 §2/§13 | ✅ scaffold |

### Verified locally

- **Migrations + seed run end-to-end** against Postgres 16 + pgvector 0.6 (ephemeral cluster).
  Result: 36 base tables, 3 `v_*` views, 15 enum types, 7 departments; **36 agents**
  (1 executive + 6 managers + 29 specialists); 0 dangling `reports_to` (referential
  integrity holds); seed is idempotent (re-running keeps 36 rows).
- **Full M0 loop verified** (ephemeral Postgres + Redis + `next start` + worker): an enqueued
  `noop` job is consumed by the worker → a run + run_step are recorded and the run completes;
  the dashboard renders **live** data — running agent from `v_running_agents`, task from
  `tasks`, notification from `notifications`, and the content KPI `2/5` computed from
  `v_today_progress`; the SSE endpoint connects to Redis pub/sub (`event: realtime.ready`).
  This meets the M0 DoD: *a no-op run appears live on the dashboard; schema migrated.*
- **Typecheck** passes for `@cos/shared`, `@cos/db`, `@cos/worker`, `@cos/web`;
  **`next build`** compiles.

### Remaining M0 items

- Auth (Supabase) + session wiring in the control plane (doc 02 §8.1); until then the control
  plane connects with `DATABASE_URL` directly and RLS is exercised via the service/JWT role.
- CI pipeline (lint + typecheck + migrate on a throwaway DB) — doc 15.
- Department-tile live rollups (currently static navigation).
- Cost/observability tables exist (`cost_ledger`, `run_steps`); the executor writes them once
  real agents land (M1).

---

## M1 — Single pipeline (Creative → carousel to Approval) (in progress)

Target (spec/16 §6 M1): the Creative agents for a carousel with their contracts (doc 03),
prompts (doc 09), memory recall/write (doc 05), and the pipeline graph Idea→…→Approval
(doc 12) with checkpointing + HITL interrupt (doc 06), plus the Approvals queue + Asset Detail
drawer (doc 07 §7).

### What this slice delivers

| Area | Deliverable | Spec trace | Status |
|------|-------------|-----------|--------|
| Prompts | `@cos/prompts`: four-layer assembly (global+role+memory+task) + per-stage task templates & strict zod output schemas for the Creative stages | doc 09 §2–§6 | ✅ done |
| Memory | recall (namespace+filters+recency; vector when embedder lands) + writeEpisode; recall-before-generation in every executor | doc 05 §5/§6/§12 | ✅ done |
| Model access | provider abstraction; deterministic **MockProvider** (schema-valid) for keyless runs; real providers plug in | doc 02 §4, doc 09 §7 | ✅ mock |
| Executor | generic agent lifecycle: recall → prompt → guarded model call → validate → persist asset → pipeline_stage_runs + run_steps + cost_ledger → memory write → realtime | doc 03 §4.2, doc 06 §11 | ✅ done |
| Creative agents | creative_director, hook_writer, carousel_writer, cta_specialist, brand_voice_manager wired as stage owners | doc 03, doc 12 §4 | ✅ done |
| Pipeline engine | spec-faithful graph engine: checkpoint-after-every-node → runs.checkpoint, bounded revision loops, HITL interrupt/resume | doc 06 §2–§7 | ✅ done |
| Carousel graph | Idea→…→Approval; Design/Thumbnail/Visual-QA are stubs (Canva = M2) | doc 12 §4/§6 | ✅ done |
| Approvals | POST /api/approvals/:id/decision (records + enqueues resume); Approvals queue + Asset Detail (content, stage results, confidence) | doc 02 §7, doc 07 §7 | ✅ done |

### Verified locally (full loop, ephemeral Postgres + Redis + two worker processes + next start)

A carousel run: `idea_generation → hook_creation → outline → draft → cta → brand_review →
grammar → seo → ig_optimisation → design(stub) → thumbnail(stub) → visual_qa(stub)` then
**paused at HITL approval** (run `paused`, asset `in_review`, approval `pending`, checkpoint
persisted; 10 pipeline_stage_runs, 9 run_steps, memory episodes written). Worker #1 was then
**killed and worker #2 started**; approving via `POST /api/approvals/:id/decision`
(`{ok:true,resumed:true}`) let worker #2 consume the resume and drive the run to `completed`
with the asset `approved`. **Meets the M1 DoD: a carousel goes idea→…→approval, resumable
across a worker restart.** The `changes_requested` (→ draft revision, operator note → memory)
and `rejected` (→ archive) branches are implemented in the engine; only `approved` was
exercised end-to-end this pass.

### Remaining M1 items

- Real model providers (OpenRouter/Anthropic) behind the provider interface (mock is default
  for keyless dev).
- Embeddings on memory write → vector recall (currently recency+filter fallback, doc 05 §14).
- Run Inspector UI (doc 07 §8) over the run_steps/tool_calls we now emit.
- Department subgraphs (doc 06 §5.3) and the `ceo` graph arrive with M4.

## M2 — Publish & measure (Instagram) (in progress)

Target (spec/16 §6 M2): Design (Canva) stages, scheduling, and idempotent Instagram publishing
with exactly-once guarantees (doc 04 §7.3), plus metric collection (instagram_analyst).

### What this slice delivers

| Area | Deliverable | Spec trace | Status |
|------|-------------|-----------|--------|
| Canva design | `CanvaAdapter` (+ MockCanvaAdapter, idempotent by asset_id+version); design & thumbnail nodes now real (no longer stubs) writing `assets.design` | doc 08 §5.1, doc 12 §4.11/§4.12 | ✅ done |
| Publisher adapter | common `PublisherAdapter` (publish + insights); MockInstagramAdapter simulates platform idempotency (same key → same media, no re-post) | doc 08 §4.1/§4.2 | ✅ done |
| Exactly-once publish | `publishOnce`: claim via `on conflict (asset_id,platform)`, idempotency-keyed outward call, single `published` transition, audit-logged once | doc 04 §7.3, doc 02 §8.4 | ✅ done |
| Scheduling | scheduling node writes a `schedules` row (default +2h slot; analytics best-time is M3) | doc 12 §4.14 | ✅ done |
| Analytics collection | `collectMetrics`: instagram_analyst reads insights per publication → `metrics` rows | doc 12 §4.16, doc 04 §8.1 | ✅ done |
| Pipeline | approved → scheduling → publishing → analytics; run completes after metrics | doc 06 §5.2, doc 12 | ✅ done |

### Verified locally (full loop, ephemeral Postgres + Redis + worker)

An approved carousel ran `… → design:passed → thumbnail:passed → scheduling → publishing →
analytics` to `completed`: asset `published`, `assets.design` set (Canva id), a `schedules`
row created, **1 `publications` row (published) with an external id + 1 publish audit**, and
**metrics collected + stored** (reach 6524). **Exactly-once verified:** calling `publishOnce`
twice for the asset (simulated retry) returned `alreadyPublished` on the second call with the
same external id, leaving **1 publications row and 1 publish audit** — no double-post. Meets
the M2 DoD.

### Remaining M2 items

- Real IG Graph + Canva adapters behind the interfaces (mocks are default for keyless dev);
  needs a test IG account token + Canva OAuth.
- Publishing at scheduled fire-time via a scheduler/cron + dedicated publish queue (doc 14);
  M2 publishes inline right after scheduling to prove the path.
- Multi-window metric collection (24h/48h/7d) + Publishing/Analytics dashboard tabs (doc 07 §6).

## M3 — Learning loop (in progress)

Target (spec/16 §6 M3): scoring, multi-dimensional clustering, pattern mining, the
recommendation engine, and forecasting (doc 13), plus memory promotion; feed recommendations
into ideation.

### What this slice delivers

| Area | Deliverable | Spec trace | Status |
|------|-------------|-----------|--------|
| Scoring | `scoreAssets`: weighted composite per asset, per-format normalization, baseline/percentile, winner/neutral/loser labels, min-sample gate | doc 13 §4, doc 04 §8.2 | ✅ done |
| Clustering | `runLearning`: categorical clusters across format/cta/length/hook with size, avg_score, confidence | doc 13 §5, doc 04 §8.3 | ✅ done |
| Pattern mining + recs | confidence-gated winning patterns → `recommendations` ("make more of X", evidence, lift, confidence), ranked | doc 13 §6/§7, doc 04 §8.4 | ✅ done |
| Forecasting | `forecast`: reach/followers 7d/30d, heuristic v1 with uncertainty bands | doc 13 §8, doc 04 §8.5 | ✅ done |
| Memory promotion | winning hook patterns promoted → `memory_semantic` (preferred_hooks) with provenance + confidence | doc 05 §5.4 | ✅ done |
| Feeds ideation | idea_generation recalls active recommendations; every recall logged on the run_step | doc 13 §7 → doc 12 §4.3, doc 05 §9 | ✅ done |
| Analytics tab | ranked recommendations (Accept/Reject → feeds ideation), top/bottom assets, clusters, forecast; decision API | doc 07 §6.2, doc 13 §14 | ✅ done |

### Verified locally (full loop, ephemeral Postgres + Redis + worker)

Seeded 8 published carousels with varied hooks + metrics (contrarian hooks engaged more). The
learning job produced: 8 scores (3 winners / 2 losers), 8 clusters (hook: contrarian avg 0.111
n4 vs direct 0.024 n4), **1 confidence-gated recommendation** ("Make more of hook=contrarian",
conf 0.921) — weaker patterns correctly withheld — 4 forecasts, and 1 promoted semantic memory
(`preferred_hooks: contrarian`, conf 0.921). A subsequent ideation run's `idea_generation`
run_step logged its recalled memory including `rec: Make more of hook "contrarian" … (+26% vs
baseline)`. **Meets the M3 DoD: real metrics → confidence-gated recommendations that surface in
the Analytics tab and influence the next ideation run; memory recall demonstrably used.**

### Remaining M3 items

- Embedding-based semantic clustering for topic/hook dimensions (categorical for now, doc 13 §5).
- `measure_recommendations` (realized_lift) to close the self-correction loop (doc 13 §7.1).
- Weekly report composition + delivery (doc 13 §9); scheduled analytics jobs via cron (doc 14, M4).

## M4 — Full org & daily automation (in progress)

Target (spec/16 §6 M4): remaining departments/agents, all formats, agent communication protocol
(doc 10), notifications (doc 03 §11.4), and the daily automation loop + cron + queues (doc 14).

### What this slice delivers

| Area | Deliverable | Spec trace | Status |
|------|-------------|-----------|--------|
| Daily loop | `runDailyLoop` (ceo graph): strategy → ideation → bounded fan-out → approve-by-exception → publish+measure (auto) → learn → weekly report → CEO summary | doc 06 §5.1, doc 14 §2 | ✅ done |
| All formats | pipeline generalized to reel/story/image/carousel (`startPipeline`, per-format unit counts) | doc 12 §6 | ✅ done |
| Approve-by-exception | auto-approve policy (enabled + eligible format + confidence gate) in the engine; else HITL | doc 12 §4.13, doc 14 §11 | ✅ done |
| Agent comms | `messages` table (SC-03) + `sendMessage`/`delegate` with channel-permission routing and delegation → tasks | doc 10 §3/§5/§6 | ✅ done |
| Notifications | Notification Manager `notify`: durable in-app + mock external channels, severity | doc 03 §11.4, doc 04 §11 | ✅ done |
| Weekly report | `composeWeeklyReport`: KPIs, top assets, recs, forecast → `weekly_reports` + delivered | doc 13 §9 | ✅ done |
| Cron | repeatable BullMQ jobs (daily.kickoff, analytics.learn, weekly_report) with stable jobIds | doc 14 §3/§4 | ✅ done |

### Verified locally (full loop, ephemeral Postgres + Redis + worker)

With auto-approve enabled for story+image (operator config), one `daily.kickoff` ran the loop
unattended: 4 content ideas across all formats → 4 pipeline runs; **story + image auto-published**
(2 publications + metrics) while **carousel + reel paused for approval** (2 pending) — operator
approves by exception. 2 agent messages (ceo→cso, ceo→creative_director) + delegated tasks were
recorded; notifications fired (approvals digest, weekly-report, daily summary); the **weekly
report was composed and delivered** (in_app+slack) with grounded KPIs; cron repeatables were
registered (6 keys in Redis). **Meets the M4 DoD.**

### Remaining M4 items

- Full per-agent department subgraphs and per-format prompt sets (structural support + shared
  Creative prompts for now); real per-format stage tuning (reel beat-sheet, story fast-track).
- `publish.tick` fire-at-slot cron + per-tool token buckets (doc 14 §4.1/§6); kill-switch +
  quiet hours (doc 14 §8); DLQ + missed-cron catch-up (doc 14 §10) — hardened in M5.
- Operations/Automation dashboard tabs + Settings → Automation (doc 07 §9).

## Implementation decisions

### ID-01 — Lightweight graph engine vs the LangGraph library

doc 02 §4 / doc 06 name **LangGraph** as the orchestrator. This slice implements a small,
spec-faithful engine that honors doc 06's *observable* contract exactly: a typed state machine,
**checkpoint-after-every-node persisted to `runs.checkpoint`** (doc 06 §4), conditional edges,
bounded revision loops (§7.1), and **HITL interrupt → `approvals` row + `runs.status='paused'`
→ resume by re-entering the approval node** (§6). Rationale: the durable-state contract is
fully expressed by `runs.checkpoint` (doc 04 §5.3), and this keeps M1 verifiable end-to-end
here without external checkpointer infra. The node handlers and `PipelineState` are written so
that adopting LangGraph's Postgres checkpointer later is a drop-in. Flagged for ratification:
either adopt the library in a later milestone or amend doc 06 to bless this engine.

## Spec corrections discovered (propose as PRs to the spec — doc 16 §3 "spec-first")

Per the operating rule, these are logged here and should be amended in the spec docs.

### SC-01 — Agent count is 36, not 35

doc 03 §2 states "1 CEO + 6 department heads + 28 specialists = **35 agents**", but the org
chart in the same section and the canonical seed in Appendix A2 both enumerate **29
specialists → 36 agents** (verified: seed loads 1 executive + 6 managers + 29 specialists).
Recommend correcting doc 03 §2 to "29 specialists = 36 agents" and updating the "35 agent
seed rows" phrasing in doc 04 §15 and doc 16 §6 (M0) to 36. The seed loads all 36 from A2
(the canonical source) rather than dropping one to match the stale total.

### SC-03 — `messages` table has no DDL in doc 04

doc 04's entity map (§2) lists `messages (agent comms, doc 10)`, but no `create table messages`
appears in §4–§11. Migration `0014_messages.sql` supplies it, matching the doc 10 §3 envelope
(correlation/causation ids, type, from/to, subject, payload, confidence, priority, hop,
deadline, task_id, delivery status). Recommend adding this table's DDL to doc 04.

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
