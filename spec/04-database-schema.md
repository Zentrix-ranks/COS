# 04 — Database Schema

**Document:** 04 of 16 · **Status:** Baseline · **Owner:** Platform Engineering

---

## 1. Purpose & conventions

This document defines the complete PostgreSQL schema for COS, including pgvector-backed
tables for memory and knowledge. It is the system of record referenced by every other
document.

### 1.1 Conventions

- **Naming:** `snake_case` tables/columns; plural table names; `*_id` foreign keys.
- **Primary keys:** `uuid` default `gen_random_uuid()` unless noted.
- **Timestamps:** `created_at timestamptz not null default now()`, `updated_at` maintained
  by trigger. All times UTC.
- **Soft delete:** `deleted_at timestamptz null` where retention matters; hard delete otherwise.
- **Enums:** implemented as Postgres `enum` types (listed in §3).
- **JSON:** `jsonb` for flexible/nested config and payloads.
- **Vectors:** `vector(1536)` (OpenAI/`text-embedding-3-small`-compatible dimensionality;
  configurable). Indexed with HNSW.
- **RLS:** enabled on all tenant/content tables; policies in §12.
- **Migrations:** forward-only, timestamped, in `packages/db/migrations`. No destructive
  change without a paired backfill/rollback plan.

### 1.2 Required extensions

```sql
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "vector";        -- pgvector
create extension if not exists "pg_trgm";       -- fuzzy text search
create extension if not exists "btree_gin";     -- composite gin indexes
```

## 2. Schema overview (entity map)

```
agents ─┐
        ├─< tasks >── runs ──< run_steps
        │      │        └──< tool_calls
        │      └──< messages (agent comms, doc 10)
content_ideas ──< assets ──< asset_versions
                    ├──< pipeline_stage_runs
                    ├──< approvals
                    ├──< schedules ──< publications ──< metrics ──< scores
                    └──< recommendations (via clusters)
memory: memory_episodes, memory_semantic, memory_vectors
knowledge: kb_documents ──< kb_chunks (vector)
research: trends, competitors, competitor_posts, personas, verified_facts
analytics: clusters, cluster_members, recommendations, forecasts, weekly_reports
ops: notifications, tool_status, audit_log, cost_ledger, health_snapshots, system_settings
auth: profiles (mirrors Supabase auth.users)
```

## 3. Enum types

```sql
create type agent_tier      as enum ('executive','manager','specialist');
create type department      as enum ('strategy','creative','design','publishing','analytics','operations','executive');
create type task_status     as enum ('queued','running','waiting_approval','blocked','done','failed','cancelled');
create type run_status      as enum ('running','paused','completed','failed','cancelled');
create type asset_type      as enum ('reel','carousel','story','image','caption','thread','short');
create type asset_status    as enum ('idea','drafting','in_review','needs_changes','approved','scheduled','published','archived','failed');
create type platform        as enum ('instagram','linkedin','tiktok','x','youtube','threads');
create type pipeline_stage  as enum (
  'trend_detection','research','idea_generation','hook_creation','outline','draft',
  'brand_review','grammar','seo','ig_optimisation','design','thumbnail','approval',
  'scheduling','publishing','analytics','learning','memory_update');
create type stage_status    as enum ('pending','running','passed','failed','skipped','held');
create type approval_status as enum ('pending','approved','rejected','changes_requested');
create type publication_status as enum ('queued','publishing','published','failed','cancelled');
create type memory_kind     as enum ('episode','semantic','preference','rule');
create type notification_severity as enum ('info','success','warning','critical');
create type recommendation_status as enum ('proposed','accepted','rejected','implemented','measured');
create type cluster_dimension as enum ('topic','hook','cta','length','design','posting_time','format');
```

## 4. Auth & settings

### 4.1 `profiles`

Mirrors Supabase `auth.users`; app-level roles & prefs.

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  prefs        jsonb not null default '{}',   -- quiet hours, channels, timezone
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

### 4.2 `system_settings`

Singleton-ish key/value for global config (budgets, auto-approve policy, thresholds).

```sql
create table system_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
-- seed examples: 'budget.daily_usd', 'autoapprove.policy', 'confidence.thresholds',
-- 'timezone', 'niche.keywords', 'sources.config'
```

## 5. Agents, tasks, runs

### 5.1 `agents`

Stores the 11-part contract (doc 03 §4.1) as structured columns + jsonb.

```sql
create table agents (
  id             text primary key,               -- stable slug e.g. 'hook_writer'
  name           text not null,
  tier           agent_tier not null,
  department     department not null,
  reports_to     text references agents(id),
  goal           text not null,
  responsibilities jsonb not null default '[]',
  tools          jsonb not null default '[]',     -- permitted tool ids (doc 08)
  inputs         jsonb not null default '[]',
  outputs        jsonb not null default '[]',
  memory_policy  jsonb not null default '{}',     -- {read:[], write:[]}
  permissions    jsonb not null default '{}',     -- {tools:[], actions:[]}
  channels       jsonb not null default '{}',     -- {in:[], out:[]}
  retry_policy   jsonb not null default '{}',
  failure_policy jsonb not null default '{}',
  model_policy   jsonb not null default '{}',     -- {tier, route, fallbacks}
  eval_policy    jsonb not null default '{}',
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on agents (department);
create index on agents (reports_to);
```

### 5.2 `tasks`

A unit of work assigned to an agent (may spawn a run).

```sql
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  agent_id     text not null references agents(id),
  parent_task  uuid references tasks(id),         -- delegation tree
  asset_id     uuid,                              -- fk added after assets (§6)
  status       task_status not null default 'queued',
  priority     int not null default 100,          -- lower = sooner
  payload      jsonb not null default '{}',       -- typed input (doc 10)
  result       jsonb,                             -- typed output
  confidence   numeric(4,3),                      -- [0,1]
  error        jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);
create index on tasks (status, priority, created_at);
create index on tasks (agent_id);
create index on tasks (correlation_id);
create index on tasks (parent_task);
```

### 5.3 `runs`

One execution of a workflow graph (doc 06). Holds checkpoint for resumability.

```sql
create table runs (
  id           uuid primary key default gen_random_uuid(),
  graph        text not null,                     -- 'ceo','pipeline','strategy',...
  task_id      uuid references tasks(id),
  asset_id     uuid,
  status       run_status not null default 'running',
  checkpoint   jsonb,                             -- LangGraph state snapshot
  current_node text,
  step_budget  int not null default 200,
  steps_used   int not null default 0,
  cost_usd     numeric(10,4) not null default 0,
  tokens_in    bigint not null default 0,
  tokens_out   bigint not null default 0,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        jsonb
);
create index on runs (status);
create index on runs (asset_id);
create index on runs (graph, started_at);
```

### 5.4 `run_steps`

Per-node execution record (drives the Run Inspector, doc 07).

```sql
create table run_steps (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references runs(id) on delete cascade,
  seq         int not null,
  node        text not null,
  agent_id    text references agents(id),
  input       jsonb,
  output      jsonb,
  reasoning_summary text,
  status      stage_status not null default 'running',
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  cost_usd    numeric(10,4) not null default 0,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, seq)
);
create index on run_steps (run_id, seq);
```

### 5.5 `tool_calls`

Every MCP tool invocation (audit + cost + debugging).

```sql
create table tool_calls (
  id          uuid primary key default gen_random_uuid(),
  run_step_id uuid references run_steps(id) on delete cascade,
  agent_id    text references agents(id),
  tool        text not null,                      -- e.g. 'instagram.publish'
  args        jsonb,
  result      jsonb,
  ok          boolean,
  error       jsonb,
  idempotency_key text,
  latency_ms  int,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now()
);
create index on tool_calls (tool, created_at);
create index on tool_calls (agent_id);
create unique index on tool_calls (idempotency_key) where idempotency_key is not null;
```

## 6. Content: ideas, assets, versions

### 6.1 `content_ideas`

```sql
create table content_ideas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  angle        text,
  format       asset_type not null,
  source       jsonb,                             -- {trend_id, competitor_id, recommendation_id}
  theme        text,                              -- KB theme
  persona_id   uuid,
  priority_score numeric(6,3),
  status       text not null default 'proposed',  -- proposed|prioritized|drafting|dropped
  rationale    text,
  created_by   text references agents(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on content_ideas (status, priority_score desc);
create index on content_ideas (format);
```

### 6.2 `assets`

The central content record.

```sql
create table assets (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid references content_ideas(id),
  type         asset_type not null,
  status       asset_status not null default 'idea',
  title        text,
  hook         text,
  body         jsonb,                             -- slides[] / script / caption per type
  caption      text,
  hashtags     text[],
  cta          jsonb,                             -- {text, kind, placement}
  design       jsonb,                             -- {canva_design_id, exports[], design_system_ref}
  confidence   numeric(4,3),
  brand_checked boolean not null default false,
  compliance_flags jsonb not null default '[]',
  current_version int not null default 1,
  created_by   text references agents(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on assets (status);
create index on assets (type, status);
create index on assets (idea_id);

-- deferred FK from tasks.asset_id
alter table tasks add constraint tasks_asset_fk
  foreign key (asset_id) references assets(id) on delete set null;
alter table runs  add constraint runs_asset_fk
  foreign key (asset_id) references assets(id) on delete set null;
```

### 6.3 `asset_versions`

Immutable history for diffing/rollback and learning.

```sql
create table asset_versions (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,                     -- full asset at this version
  changed_by  text references agents(id),
  change_note text,
  created_at  timestamptz not null default now(),
  unique (asset_id, version)
);
```

### 6.4 `pipeline_stage_runs`

Per-stage record for the 20-stage pipeline (doc 12).

```sql
create table pipeline_stage_runs (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  stage       pipeline_stage not null,
  status      stage_status not null default 'pending',
  agent_id    text references agents(id),
  input       jsonb,
  output      jsonb,
  passed      boolean,
  notes       text,
  confidence  numeric(4,3),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on pipeline_stage_runs (asset_id, stage);
create index on pipeline_stage_runs (stage, status);
```

## 7. Approvals, scheduling, publishing

### 7.1 `approvals`

```sql
create table approvals (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  requested_by text references agents(id),
  status      approval_status not null default 'pending',
  decided_by  uuid references profiles(id),
  note        text,                               -- operator feedback (learned from)
  requested_at timestamptz not null default now(),
  decided_at  timestamptz
);
create index on approvals (status, requested_at);
create index on approvals (asset_id);
```

### 7.2 `schedules`

```sql
create table schedules (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete cascade,
  platform     platform not null,
  scheduled_at timestamptz not null,
  timezone     text not null default 'UTC',
  status       text not null default 'scheduled', -- scheduled|publishing|published|cancelled
  reason       text,                              -- why this slot (best-time rationale)
  created_by   text references agents(id),
  created_at   timestamptz not null default now(),
  unique (asset_id, platform)
);
create index on schedules (scheduled_at, status);
```

### 7.3 `publications`

Exactly-once publish record.

```sql
create table publications (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references assets(id) on delete cascade,
  platform      platform not null,
  external_id   text,                             -- platform media id
  permalink     text,
  status        publication_status not null default 'queued',
  idempotency_key text not null,
  error         jsonb,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (asset_id, platform),                    -- no double-publish per platform
  unique (idempotency_key)
);
create index on publications (status);
```

## 8. Metrics, scores, analytics

### 8.1 `metrics`

Time-series metrics per publication.

```sql
create table metrics (
  id            uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  window        text not null default 'lifetime', -- '24h','48h','7d','lifetime'
  reach         bigint,
  impressions   bigint,
  views         bigint,
  watch_time_s  bigint,
  avg_watch_s   numeric(8,2),
  saves         bigint,
  shares        bigint,
  comments      bigint,
  likes         bigint,
  profile_visits bigint,
  follows       bigint,
  link_clicks   bigint,
  ctr           numeric(6,4),
  raw           jsonb                             -- full provider payload
);
create index on metrics (asset_id, captured_at);
create index on metrics (publication_id, window);
```

### 8.2 `scores`

```sql
create table scores (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete cascade,
  composite    numeric(6,3) not null,             -- normalized performance score
  components   jsonb not null,                    -- weighted parts
  baseline     numeric(6,3),
  percentile   numeric(5,2),
  label        text,                              -- 'winner'|'neutral'|'loser'
  sample_ok    boolean not null default true,     -- passed min-sample threshold
  scored_at    timestamptz not null default now()
);
create index on scores (label, composite desc);
create index on scores (asset_id);
```

### 8.3 `clusters` / `cluster_members`

```sql
create table clusters (
  id          uuid primary key default gen_random_uuid(),
  dimension   cluster_dimension not null,
  label       text not null,                      -- e.g. 'contrarian hook'
  centroid    vector(1536),                       -- for semantic dims
  size        int not null default 0,
  avg_score   numeric(6,3),
  confidence  numeric(4,3),
  window      text not null default 'last_90',
  computed_at timestamptz not null default now()
);
create index on clusters (dimension, avg_score desc);

create table cluster_members (
  cluster_id  uuid not null references clusters(id) on delete cascade,
  asset_id    uuid not null references assets(id) on delete cascade,
  weight      numeric(6,3) default 1,
  primary key (cluster_id, asset_id)
);
```

### 8.4 `recommendations`

```sql
create table recommendations (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,                      -- "Make more of X because Y"
  evidence    jsonb not null,                     -- {clusters:[], assets:[], metrics:{}}
  confidence  numeric(4,3) not null,
  status      recommendation_status not null default 'proposed',
  target_dept department,
  realized_lift numeric(6,3),                     -- filled after measurement
  created_by  text references agents(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on recommendations (status, confidence desc);
```

### 8.5 `forecasts` & `weekly_reports`

```sql
create table forecasts (
  id          uuid primary key default gen_random_uuid(),
  metric      text not null,                      -- 'reach','followers'
  horizon     text not null,                      -- '7d','30d'
  point       numeric,
  lower       numeric,
  upper       numeric,
  method      text,
  created_at  timestamptz not null default now()
);

create table weekly_reports (
  id          uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  summary     text not null,
  highlights  jsonb not null default '[]',
  recommendations jsonb not null default '[]',
  metrics     jsonb not null default '{}',
  delivered_channels text[],
  created_at  timestamptz not null default now(),
  unique (period_start, period_end)
);
```

## 9. Research & knowledge

### 9.1 `trends`, `competitors`, `competitor_posts`

```sql
create table trends (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source      text not null,                      -- 'reddit'|'youtube'|'web'|'exa'
  url         text,
  keywords    text[],
  relevance   numeric(4,3),
  momentum    numeric(4,3),
  evidence    jsonb,
  detected_at timestamptz not null default now(),
  expires_at  timestamptz
);
create index on trends (relevance desc, detected_at desc);

create table competitors (
  id          uuid primary key default gen_random_uuid(),
  handle      text not null unique,
  platform    platform not null default 'instagram',
  notes       text,
  created_at  timestamptz not null default now()
);

create table competitor_posts (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  external_id   text,
  format        asset_type,
  caption       text,
  observed_metrics jsonb,                          -- estimated signals
  posted_at     timestamptz,
  captured_at   timestamptz not null default now()
);
create index on competitor_posts (competitor_id, posted_at desc);
```

### 9.2 `personas` & `verified_facts`

```sql
create table personas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  interests   text[],
  pains       text[],
  language    jsonb,                              -- tone/phrases
  updated_by  text references agents(id),
  updated_at  timestamptz not null default now()
);

create table verified_facts (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,
  claim       text not null,
  status      text not null default 'verified',  -- verified|unverified|risky
  citations   jsonb not null default '[]',
  verified_by text references agents(id),
  verified_at timestamptz not null default now()
);
create index on verified_facts (topic);
```

### 9.3 Knowledge base: `kb_documents` & `kb_chunks`

```sql
create table kb_documents (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,                      -- 'brand','psychology','smc',...
  title       text not null,
  source      text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on kb_documents (category);

create table kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  ordinal     int not null,
  content     text not null,
  embedding   vector(1536),
  tokens      int,
  created_at  timestamptz not null default now()
);
create index kb_chunks_embedding_idx on kb_chunks
  using hnsw (embedding vector_cosine_ops);
create index on kb_chunks using gin (content gin_trgm_ops);
```

## 10. Memory tables (see doc 05 for semantics)

```sql
create table memory_episodes (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text references agents(id),
  namespace   text not null,                      -- e.g. 'hooks','winners','reactions'
  task_id     uuid references tasks(id),
  asset_id    uuid references assets(id),
  summary     text not null,                      -- compact description of what happened
  payload     jsonb not null default '{}',
  outcome     text,                               -- 'success'|'failure'|'neutral'
  embedding   vector(1536),
  importance  numeric(4,3) default 0.5,
  created_at  timestamptz not null default now()
);
create index memory_episodes_embedding_idx on memory_episodes
  using hnsw (embedding vector_cosine_ops);
create index on memory_episodes (agent_id, namespace, created_at desc);

create table memory_semantic (
  id          uuid primary key default gen_random_uuid(),
  namespace   text not null,                      -- 'brand_rules','writing_style','preferred_hooks'
  key         text not null,
  value       jsonb not null,
  embedding   vector(1536),
  confidence  numeric(4,3) default 0.7,
  source_episodes uuid[],                          -- provenance
  updated_at  timestamptz not null default now(),
  unique (namespace, key)
);
create index memory_semantic_embedding_idx on memory_semantic
  using hnsw (embedding vector_cosine_ops);
```

## 11. Ops tables

```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  severity    notification_severity not null default 'info',
  title       text not null,
  body        text,
  data        jsonb not null default '{}',
  channels    text[] not null default '{in_app}',
  read_at     timestamptz,
  delivered   jsonb not null default '{}',        -- per-channel delivery status
  created_at  timestamptz not null default now()
);
create index on notifications (created_at desc);
create index on notifications (severity);

create table tool_status (
  tool        text primary key,                   -- 'instagram.publish'
  healthy     boolean not null default true,
  breaker_open boolean not null default false,
  last_ok_at  timestamptz,
  last_error  jsonb,
  rate_remaining int,
  updated_at  timestamptz not null default now()
);

create table audit_log (
  id          bigserial primary key,
  actor_type  text not null,                      -- 'agent'|'user'|'system'
  actor_id    text not null,
  action      text not null,                      -- 'publish'|'delete'|'approve'|'send'
  target      text,
  before      jsonb,
  after       jsonb,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_log (action, created_at desc);
create index on audit_log (actor_id);

create table cost_ledger (
  id          bigserial primary key,
  run_id      uuid references runs(id),
  agent_id    text references agents(id),
  provider    text,                               -- 'openrouter','openai','anthropic'
  model       text,
  tokens_in   int,
  tokens_out  int,
  usd         numeric(10,5) not null,
  created_at  timestamptz not null default now()
);
create index on cost_ledger (created_at);
create index on cost_ledger (agent_id);

create table health_snapshots (
  id          uuid primary key default gen_random_uuid(),
  overall     text not null,                      -- 'green'|'amber'|'red'
  queue_depth int,
  run_success_rate numeric(5,2),
  tool_outages int,
  budget_burn_usd numeric(10,2),
  ig_health   text,                               -- 'Excellent'|'Good'|'Fair'|'Poor'
  details     jsonb,
  created_at  timestamptz not null default now()
);
```

## 12. Row-Level Security (RLS)

RLS is enabled on all content, analytics, and ops tables. v1 is single-tenant (Zentrix),
so policies enforce **role-based** access rather than tenant isolation; the structure is
tenant-ready for later.

```sql
alter table assets enable row level security;
create policy assets_read  on assets for select
  using (auth.role() in ('owner','admin','editor','viewer'));
create policy assets_write on assets for all
  using (auth.role() in ('owner','admin','editor'))
  with check (auth.role() in ('owner','admin','editor'));

-- approvals: only owner/admin may decide
alter table approvals enable row level security;
create policy approvals_decide on approvals for update
  using (auth.role() in ('owner','admin'));
```

Worker processes connect with a **service role** that bypasses RLS but is confined to the
worker network and audited via `audit_log`. Agent-level permissions (which agent may do
what) are enforced in the runtime (doc 03 §12.3, doc 08), not RLS.

## 13. Views & helpers

```sql
-- Dashboard overview (doc 07 Mission Control)
create view v_today_progress as
select
  count(*) filter (where status = 'published' and updated_at::date = now()::date) as completed,
  count(*) filter (where updated_at::date = now()::date) as total,
  count(*) filter (where status = 'in_review') as pending_reviews,
  count(*) filter (where status = 'scheduled') as scheduled
from assets;

-- Approval queue
create view v_pending_approvals as
select a.*, ap.id as approval_id, ap.requested_at
from approvals ap join assets a on a.id = ap.asset_id
where ap.status = 'pending'
order by ap.requested_at;

-- Running agents (live status is also pushed via realtime; this is the durable view)
create view v_running_agents as
select r.graph, r.current_node, rs.agent_id, r.updated_at
from runs r
left join lateral (
  select agent_id from run_steps s where s.run_id = r.id order by seq desc limit 1
) rs on true
where r.status in ('running','paused');
```

## 14. Indexing & performance notes

- Vector indexes use **HNSW** with `vector_cosine_ops`; tune `m`/`ef_construction` per
  table size; set `ef_search` at query time for recall/latency tradeoff.
- Hot query paths: task queue (`tasks(status,priority,created_at)`), approvals, metrics by
  asset, cluster reads — all indexed above.
- `metrics` and `tool_calls` grow fast → partition by month at scale; retention policy in
  `system_settings` (`retention.metrics_days`, `retention.tool_calls_days`).
- Use `pg_trgm` GIN for fuzzy KB/content search alongside vector search (hybrid retrieval,
  doc 05 §hybrid).

## 15. Migration & seeding

- **Migration order:** extensions → enums → auth/settings → agents → tasks/runs →
  ideas/assets → approvals/schedules/publications → metrics/scores/analytics →
  research/knowledge → memory → ops → views.
- **Seed:** the 35 agent rows (doc 03), `system_settings` defaults, KB categories,
  personas skeletons, competitor list.
- **Backfills:** embedding backfill jobs for KB and memory run post-migration (doc 05).

## 16. Data retention & privacy

- Raw provider payloads (`metrics.raw`, `tool_calls.result`) retained per policy then
  pruned to aggregates.
- No storage of personal data beyond what platform APIs return for public content
  analytics; comment text is stored only as needed for engagement analysis and is subject
  to retention limits.
- Audit log is append-only and retained long-term.

## 17. Open questions

- OQ-01 Embedding dimensionality/model of record (1536 vs 3072) — pick per cost/quality.
- OQ-02 Partition metrics/tool_calls from day one or at volume threshold? (threshold.)
- OQ-03 Do we need per-user tenancy columns pre-emptively for future SaaS? (add nullable
  `tenant_id` now to avoid a painful migration later — recommended.)

*End of document 04.*
