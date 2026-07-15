-- 0009_research_knowledge.sql
-- Source: spec/04-database-schema.md §9 (trends, competitors, competitor_posts, personas,
-- verified_facts, kb_documents, kb_chunks).

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
create trigger personas_set_updated_at before update on personas
  for each row execute function set_updated_at();

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
create trigger kb_documents_set_updated_at before update on kb_documents
  for each row execute function set_updated_at();

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
