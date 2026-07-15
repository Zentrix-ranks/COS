# Runbooks (incident response)

Source of truth: [`spec/15-deployment-guide.md`](../../spec/15-deployment-guide.md) §9–§10.
Owned by **Ops Lead**. Each runbook lists detection → first actions → verification → follow-up.
These are on-call procedures for COS; keep them short and executable under pressure.

## Quick reference

| Incident | Runbook |
|----------|---------|
| Instagram publishing failing | [instagram-publishing.md](instagram-publishing.md) |
| Model provider outage | [model-provider-outage.md](model-provider-outage.md) |
| Budget cap hit | [budget-cap.md](budget-cap.md) |
| Runs stuck / paused | [runs-stuck.md](runs-stuck.md) |
| DB degraded | [db-degraded.md](db-degraded.md) |
| Redis down | [redis-down.md](redis-down.md) |

## Kill-switch (pause the operation)

The operator/`ops_lead`/`ceo` can halt generation without stopping the service:

```sql
-- pause: cron keeps firing but generation jobs short-circuit; in-flight runs checkpoint + hold
update system_settings set value='true'::jsonb where key='operation.paused';
-- (insert it if absent)
insert into system_settings (key, value) values ('operation.paused','true'::jsonb)
  on conflict (key) do update set value='true'::jsonb;

-- resume
update system_settings set value='false'::jsonb where key='operation.paused';
```

Paused runs are resumable from their last checkpoint (doc 06 §4); no side effects are lost.

## Disaster recovery

See [disaster-recovery.md](disaster-recovery.md) for RPO/RTO targets, the restore-from-backup
drill, migration rollback, and the secrets re-provisioning checklist (doc 15 §10).
