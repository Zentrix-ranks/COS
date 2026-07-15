-- 0013_views.sql
-- Source: spec/04-database-schema.md §13 (views & helpers). Drives Mission Control (doc 07 §5).

-- Dashboard overview (doc 07 Mission Control)
create view v_today_progress as
select
  count(*) filter (where status = 'published' and updated_at::date = now()::date) as completed,
  count(*) filter (where updated_at::date = now()::date) as total,
  count(*) filter (where status = 'in_review') as pending_reviews,
  count(*) filter (where status = 'scheduled') as scheduled
from assets;

-- Approval queue
create view v_pending_approvals as
select a.*, ap.id as approval_id, ap.requested_at
from approvals ap join assets a on a.id = ap.asset_id
where ap.status = 'pending'
order by ap.requested_at;

-- Running agents (live status is also pushed via realtime; this is the durable view)
create view v_running_agents as
select r.graph, r.current_node, rs.agent_id, r.updated_at
from runs r
left join lateral (
  select agent_id from run_steps s where s.run_id = r.id order by seq desc limit 1
) rs on true
where r.status in ('running','paused');
