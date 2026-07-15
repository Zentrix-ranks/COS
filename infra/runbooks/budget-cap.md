# Runbook — Budget cap hit

**Owner:** Ops Lead · **Severity:** critical · Source: spec/15 §9, spec/02 §8.3, spec/14 §8.

## Detection
- Critical notification "Daily budget cap hit — generation halted".
- Runs failing with `error.reason = 'budget_exceeded'`; `health_snapshots.overall = 'red'`.

## First actions
1. Confirm the halt is real — generation should already be stopped by the executor guard:
   ```sql
   select coalesce(sum(usd),0) spend from cost_ledger where created_at::date = now()::date;
   select value from system_settings where key='budget.daily_usd';
   ```
2. Find the runaway agent/tool:
   ```sql
   select agent_id, model, sum(usd) usd, count(*) calls
     from cost_ledger where created_at::date = now()::date
     group by agent_id, model order by usd desc limit 10;
   ```
3. Decide: raise the cap (if spend is legitimate) or pause the operation (kill-switch) while
   investigating a loop/misconfiguration.
   ```sql
   -- raise cap
   update system_settings set value='50'::jsonb where key='budget.daily_usd';
   ```

## Verification
- New generation resumes only when `spend < cap`; confirm a fresh run advances past a model
  node without a `budget_exceeded` error.

## Follow-up
- If a single agent/tool caused the burn, review its `model_policy`/loop guards; add a
  per-run cap if needed. File a spec change if the default cap was wrong.
