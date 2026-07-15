# Appendix A1 — API Reference

**Appendix to docs 02 (§7) & 07 (§15) · Status:** Baseline · **Owner:** Platform Engineering

---

## 1. Conventions

- **Base:** `/api` (control plane, Next.js route handlers / server actions).
- **Format:** JSON. Requests/responses use `camelCase`.
- **Auth:** Supabase session (cookie/JWT). Role required noted per endpoint
  (viewer/editor/admin/owner). Worker↔control endpoints use a signed service token.
- **Errors:** `application/problem+json`:
  ```json
  { "type": "https://cos/errors/<slug>", "title": "…", "status": 409,
    "detail": "…", "instance": "/api/…", "correlationId": "uuid" }
  ```
- **Pagination:** cursor-based: `?limit=20&cursor=<opaque>` → `{ items, nextCursor }`.
- **Concurrency:** mutations accept `If-Match: <version>` or body `version`; mismatch → `409`.
- **Idempotency:** outward/mutating POSTs accept `Idempotency-Key` header (required for
  publish/notify).
- **Realtime:** SSE at `GET /api/stream?channels=…`.

## 2. Overview & dashboard

### `GET /api/overview`
Role: viewer. Returns Mission Control KPIs (doc 07 §5).
```json
{ "progressPct": 82, "content": {"completed":18,"total":22},
  "pendingReviews": 4, "scheduledPosts": 9,
  "health": {"overall":"green","instagram":"Excellent"} }
```

### `GET /api/agents/status`
Role: viewer. Live agent activity (also streamed via SSE `agents`).
```json
{ "items": [
  {"agentId":"ceo","name":"CEO Agent","state":"thinking","verb":"Thinking…","runId":"…"},
  {"agentId":"creative_director","name":"Creative Director","state":"running","verb":"Generating Reel #52","runId":"…"}
]}
```

### `GET /api/queue`
Role: viewer. Task queue (done + pending).
```json
{ "items":[
  {"id":"…","title":"Weekly Market Report","status":"done"},
  {"id":"…","title":"Hook Optimisation","status":"queued"} ]}
```

### `GET /api/health`
Role: admin. Latest `health_snapshots` rollup + subsystem detail.

## 3. Agents

### `GET /api/agents`
Role: viewer. List agent contracts (doc 03/04).
Query: `?department=creative&enabled=true`.

### `GET /api/agents/:id`
Role: viewer. Full 11-part contract for one agent.

### `PATCH /api/agents/:id`
Role: admin. Update mutable contract fields (enabled, model_policy, retry_policy…).
Body: partial contract; `version` required. → `200` updated | `409` conflict.

## 4. Content ideas

### `GET /api/ideas`
Role: editor. Query: `?status=prioritized&format=carousel&limit=`.

### `POST /api/ideas`
Role: editor. Create an idea (usually agent-created; manual allowed).
```json
{ "title":"…","angle":"…","format":"carousel","theme":"SMC","personaId":"…" }
```

### `PATCH /api/ideas/:id`
Role: editor. Update status/priority. → `200`.

## 5. Assets

### `GET /api/assets`
Role: viewer. Query: `?type=&status=&q=<search>&limit=&cursor=`.
Returns asset summaries.

### `GET /api/assets/:id`
Role: viewer. Full asset incl. `body`, `caption`, `cta`, `design`, `confidence`, and
`stageRuns` (all `pipeline_stage_runs`), `versions`, `memoriesUsed`.

### `POST /api/assets`
Role: editor. Create asset (manual authoring path). Body: `{ ideaId?, type, title }`.

### `PATCH /api/assets/:id`
Role: editor. Edit content; creates a new `asset_versions` snapshot. `version` required.

### `POST /api/assets/:id/rerun-stage`
Role: editor. Re-run a pipeline stage. Body: `{ stage: "brand_review" }`. Enqueues job.

### `GET /api/assets/:id/versions`
Role: viewer. Version history.

## 6. Pipeline & runs

### `GET /api/runs`
Role: viewer. Query: `?status=running&graph=pipeline&assetId=`.

### `GET /api/runs/:id`
Role: viewer. Run header (status, graph, cost, tokens, currentNode).

### `GET /api/runs/:id/trace`
Role: viewer. Full trace for the Run Inspector (doc 07 §8):
```json
{ "run": {…}, "steps": [
  {"seq":1,"node":"draft","agentId":"carousel_writer","status":"passed",
   "reasoningSummary":"…","toolCalls":[{"tool":"openrouter.generate","ok":true,"latencyMs":2200,"costUsd":0.031}],
   "tokensIn":1800,"tokensOut":600,"costUsd":0.031}
]}
```

### `POST /api/runs/:id/retry`
Role: editor. Resume/retry from last checkpoint. Idempotent.

### `POST /api/runs/:id/cancel`
Role: editor. Cancel a run (checkpoints, marks cancelled).

## 7. Approvals (HITL)

### `GET /api/approvals`
Role: editor. Pending approvals with preview (`v_pending_approvals`, doc 04 §13).

### `GET /api/approvals/:id`
Role: editor. Full approval context: asset + all stage results + confidence + proposed
schedule + memories used.

### `POST /api/approvals/:id/decision`
Role: admin/owner. Body:
```json
{ "decision":"approved|changes_requested|rejected", "note":"optional operator feedback" }
```
Effects: writes `approvals`; unblocks the paused run (resume job); on `changes_requested`
injects the note into memory (doc 05). → `200 { runId, next:"scheduling|draft|archive" }`.

### `POST /api/approvals/bulk`
Role: admin/owner. Bulk approve high-confidence items (policy-guarded).
Body: `{ ids:[…], decision:"approved" }`.

## 8. Schedules & calendar

### `GET /api/schedules`
Role: viewer. Query: `?from=&to=&platform=&status=`.

### `POST /api/schedules`
Role: editor. Create schedule. Body: `{ assetId, platform, scheduledAt, timezone }`.
Unique `(assetId, platform)`.

### `PATCH /api/schedules/:id`
Role: editor. Reschedule (drag-to-reschedule, doc 07 §6.3). Collision → `409`.

### `DELETE /api/schedules/:id`
Role: editor. Cancel a schedule.

### `GET /api/calendar`
Role: viewer. Calendar view: draft/scheduled/published merged by day.

## 9. Publications

### `GET /api/publications`
Role: viewer. Query: `?platform=&status=&assetId=`.

### `POST /api/publications/:assetId/publish`
Role: admin/owner. Manual publish trigger (normally automation). **Requires
`Idempotency-Key`.** → `202` enqueued. Exactly-once enforced (doc 04 §7.3).

## 10. Analytics

### `GET /api/analytics/overview`
Role: viewer. KPI movement, top/bottom assets, IG health.

### `GET /api/analytics/metrics/:assetId`
Role: viewer. Time-series metrics per window.

### `GET /api/analytics/clusters`
Role: viewer. Query: `?dimension=hook&window=last_90`. Returns clusters + avg_score + confidence.

### `GET /api/analytics/recommendations`
Role: viewer. Ranked recommendations with evidence + confidence + status.

### `POST /api/analytics/recommendations/:id/decision`
Role: editor. Body: `{ decision:"accepted|rejected" }`. Accepted recs feed ideation (doc 13).

### `GET /api/analytics/forecast`
Role: viewer. Query: `?metric=reach&horizon=7d`.

### `GET /api/reports/weekly`
Role: viewer. List weekly reports.

### `GET /api/reports/weekly/:id`
Role: viewer. Rendered weekly report (doc 13 §9).

### `POST /api/reports/weekly/generate`
Role: admin. Trigger off-cycle weekly report. → `202`.

## 11. Research (read)

### `GET /api/trends`
Role: viewer. `?minRelevance=0.5&since=`. Latest scored trends.

### `GET /api/competitors` · `GET /api/competitors/:id/posts`
Role: viewer. Competitor DB + observed posts.

### `GET /api/personas`
Role: viewer. Audience personas.

## 12. Knowledge base

### `GET /api/kb/search`
Role: viewer. `?q=&category=&k=8`. Hybrid retrieval (doc 11 §6). Returns chunks + citations.

### `POST /api/kb/ingest`
Role: admin. Ingest a document (Notion/Drive/URL/upload). Body: `{ source, category, ref }`.
→ `202` (async ingest job).

### `GET /api/kb/documents` · `GET /api/kb/documents/:id`
Role: viewer/editor. List/read KB documents + metadata.

## 13. Settings

### `GET /api/settings` · `PATCH /api/settings`
Role: admin/owner. Read/update `system_settings` (budgets, auto-approve policy, thresholds,
timezone, sources, cadence). `PATCH` body is a partial keyed map.

### `GET /api/tools/status`
Role: admin. Tool health matrix (`tool_status`, doc 04 §11): healthy, breakerOpen,
rateRemaining, lastError.

### `POST /api/tools/:tool/breaker`
Role: admin. Manually open/close a circuit breaker. Body: `{ open: true }`.

### `GET /api/costs`
Role: admin. Cost dashboard data from `cost_ledger`: by day/agent/tool/provider.

## 14. Users & roles

### `GET /api/users` · `PATCH /api/users/:id/role`
Role: owner. Manage roles (owner/admin/editor/viewer). RLS-backed.

## 15. Automation

### `GET /api/automation`
Role: admin. Cron entries, last runs, enable states (doc 14 §3).

### `POST /api/automation/:job/run`
Role: admin. Fire a job now (idempotent). e.g., `daily.kickoff`, `analytics.learn`.

### `POST /api/automation/pause` · `POST /api/automation/resume`
Role: owner. Kill-switch: pause/resume the whole operation (doc 14 §8).

## 16. Notifications

### `GET /api/notifications`
Role: viewer. In-app notifications; `?unread=true`.

### `POST /api/notifications/:id/read`
Role: viewer. Mark read.

## 17. Realtime (SSE)

### `GET /api/stream?channels=agents,queue,notifications,runs:<id>`
Role: session. Server-Sent Events. Event shape:
```
event: agents
data: {"agentId":"trend_researcher","state":"running","verb":"Analyzing Reddit","runId":"…"}
```
Channels: `agents`, `queue`, `notifications`, `approvals`, `runs:<id>`, `health`.

## 18. Internal (worker ↔ control plane)

Signed service token; not user-facing.

- `POST /internal/runs/:id/step` — worker reports a completed `run_step`.
- `POST /internal/runs/:id/status` — status/checkpoint update.
- `POST /internal/notifications` — request a notification dispatch (Notification Manager).
- `POST /internal/approvals/request` — open an approval (HITL interrupt).
- `POST /internal/costs` — append `cost_ledger` entries.

## 19. Status codes (summary)

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 202 | Accepted (async job enqueued) |
| 400 | Validation error |
| 401 / 403 | Unauthenticated / forbidden (role/RLS) |
| 404 | Not found |
| 409 | Version conflict / schedule collision / duplicate publish |
| 422 | Semantic validation (e.g., budget exceeded) |
| 429 | Rate limited |
| 500 | Server error (correlationId included) |

## 20. Rate limits

Per-session and per-role limits on mutating endpoints; publish/notify additionally bounded by
tool rate limits (doc 08 §2.1). `429` returns `Retry-After`.

*End of Appendix A1.*
