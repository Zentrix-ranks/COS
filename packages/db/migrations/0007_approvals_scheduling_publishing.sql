-- 0007_approvals_scheduling_publishing.sql
-- Source: spec/04-database-schema.md §7 (approvals, schedules, publications).

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
