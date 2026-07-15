# Runbook — Instagram publishing failing

**Owner:** Ops Lead · **Severity:** high · Source: spec/15 §9, spec/08 §4.1, spec/12 §4.15.

## Detection
- Publish stage `pipeline_stage_runs.status='failed'`; `tool_status.breaker_open=true` for
  `instagram.publish`; critical notification / DLQ entry.

## First actions
1. Check the token + breaker: `select * from tool_status where tool like 'instagram%';`
2. If the breaker is open, it half-opens after cooldown; a valid token clears it on first success.
3. Refresh the IG long-lived token (Tool Manager / vault) if expired; re-enable manual-assist
   for unsupported media types (operator publishes manually), then still collect analytics.
4. Reschedule affected assets to the next best slot (never silently drop — doc 14 §10).

## Verification
- A test publish returns an `external_id`; **exactly-once holds** — no duplicate `publications`
  row for `(asset_id, platform)` (doc 04 §7.3). Retries never double-post.

## Follow-up
- If token expiry recurs, automate refresh cadence; alert before expiry.
