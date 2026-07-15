-- 0011_ops.sql
-- Source: spec/04-database-schema.md §11 (notifications, tool_status, audit_log,
-- cost_ledger, health_snapshots).

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
create trigger tool_status_set_updated_at before update on tool_status
  for each row execute function set_updated_at();

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
