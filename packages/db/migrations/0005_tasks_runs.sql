-- 0005_tasks_runs.sql
-- Source: spec/04-database-schema.md §5.2–5.5 (tasks, runs, run_steps, tool_calls).
-- tasks.asset_id / runs.asset_id FKs to assets are added in 0006 (deferred, §6.2).

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  agent_id     text not null references agents(id),
  parent_task  uuid references tasks(id),         -- delegation tree
  asset_id     uuid,                              -- fk added after assets (0006)
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
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

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
create trigger runs_set_updated_at before update on runs
  for each row execute function set_updated_at();

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
