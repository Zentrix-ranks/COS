-- 0015_rls_fixes.sql
-- SC-05: doc 04 §12 enables RLS on `approvals` but defines only an UPDATE policy
-- (approvals_decide). With RLS enabled and no SELECT policy, direct reads of approvals return
-- zero rows for every role — so the Approval service can't read the row it needs to decide.
-- Add a SELECT policy for the app roles. Recommend adding this to doc 04 §12.

alter table approvals enable row level security; -- idempotent (already enabled in 0012)
create policy approvals_read on approvals for select
  using (auth.role() in ('owner','admin','editor','viewer'));
