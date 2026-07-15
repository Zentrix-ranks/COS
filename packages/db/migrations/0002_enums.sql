-- 0002_enums.sql
-- Source: spec/04-database-schema.md §3 (enum types). Verbatim.

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
