-- 0004_agents.sql
-- Source: spec/04-database-schema.md §5.1 (agents). Stores the 11-part contract (doc 03 §4.1).

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
create trigger agents_set_updated_at before update on agents
  for each row execute function set_updated_at();
