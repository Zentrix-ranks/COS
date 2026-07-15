-- 0014_messages.sql
-- Agent communication protocol persistence. Source: spec/10 §3 (envelope), §5.1 (persist a
-- messages row on routing), §6 (delegation/escalation), §7 (relation to tasks/runs).
-- NOTE (SC-03): doc 04's entity map (§2) lists `messages` but ships no DDL; this migration
-- supplies it, matching the doc 10 envelope. Recommend adding it to doc 04.

create table messages (
  id            uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,                  -- one work thread across many messages
  causation_id  uuid,                            -- the message that caused this one
  type          text not null,                   -- task.assign | task.result | escalate | notify | ...
  from_agent    text references agents(id),
  to_agent      text not null,                   -- agent id or role/channel
  subject       text not null,
  payload       jsonb not null default '{}',
  confidence    numeric(4,3),
  priority      int not null default 100,
  hop           int not null default 0,          -- loop guard (doc 10 §2)
  deadline      timestamptz,
  task_id       uuid references tasks(id),
  status        text not null default 'sent',    -- sent | delivered | acked | dropped
  delivered_at  timestamptz,
  acked_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index on messages (correlation_id, created_at);
create index on messages (to_agent, status);
create index on messages (type, created_at desc);
