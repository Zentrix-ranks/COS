-- 0008_metrics_scores_analytics.sql
-- Source: spec/04-database-schema.md §8 (metrics, scores, clusters, cluster_members,
-- recommendations, forecasts, weekly_reports).

create table metrics (
  id            uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  "window"      text not null default 'lifetime', -- '24h','48h','7d','lifetime' (quoted: reserved word)
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
create index on metrics (publication_id, "window");

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

create table clusters (
  id          uuid primary key default gen_random_uuid(),
  dimension   cluster_dimension not null,
  label       text not null,                      -- e.g. 'contrarian hook'
  centroid    vector(1536),                       -- for semantic dims
  size        int not null default 0,
  avg_score   numeric(6,3),
  confidence  numeric(4,3),
  "window"    text not null default 'last_90',
  computed_at timestamptz not null default now()
);
create index on clusters (dimension, avg_score desc);

create table cluster_members (
  cluster_id  uuid not null references clusters(id) on delete cascade,
  asset_id    uuid not null references assets(id) on delete cascade,
  weight      numeric(6,3) default 1,
  primary key (cluster_id, asset_id)
);

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
create trigger recommendations_set_updated_at before update on recommendations
  for each row execute function set_updated_at();

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
