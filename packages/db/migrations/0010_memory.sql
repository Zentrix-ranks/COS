-- 0010_memory.sql
-- Source: spec/04-database-schema.md §10 (memory_episodes, memory_semantic).
-- Semantics in spec/05-memory-system.md.

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
create trigger memory_semantic_set_updated_at before update on memory_semantic
  for each row execute function set_updated_at();
