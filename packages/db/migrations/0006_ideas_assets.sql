-- 0006_ideas_assets.sql
-- Source: spec/04-database-schema.md §6 (content_ideas, assets, asset_versions,
-- pipeline_stage_runs) + deferred FKs from tasks/runs to assets.

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
create trigger content_ideas_set_updated_at before update on content_ideas
  for each row execute function set_updated_at();

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
create trigger assets_set_updated_at before update on assets
  for each row execute function set_updated_at();

-- deferred FK from tasks.asset_id / runs.asset_id (§6.2)
alter table tasks add constraint tasks_asset_fk
  foreign key (asset_id) references assets(id) on delete set null;
alter table runs  add constraint runs_asset_fk
  foreign key (asset_id) references assets(id) on delete set null;

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
