# 08 — Tool Integration Specification

**Document:** 08 of 16 · **Status:** Baseline · **Owner:** Platform Engineering

---

## 1. Purpose & principle

Agents must **use tools, not hallucinate.** Every external capability — research, design,
publishing, analytics, notifications — is exposed to agents through the **Model Context
Protocol (MCP)** as typed tools with explicit permissions, rate limits, idempotency, and
failure modes. This document defines the integration layer, the per-tool contracts, and the
guardrails around them.

## 2. Integration architecture

```
agent executor ─► ToolClient (per tool) ─► guard middleware ─► MCP server ─► external API
                                     │
                       permissions · rate limit · budget · idempotency · audit
```

- Each tool is an **MCP server** (hosted or local) with a typed schema.
- A **ToolClient** wraps each MCP server with the guard middleware (doc 02 §6.3).
- Tools are declared in a registry; agents reference tools by stable id (e.g.,
  `instagram.publish`). Permissions bind agent → allowed tool ids (doc 03 §12.3).

### 2.1 Guard middleware (applies to every tool call)

1. **Permission check** — is this agent allowed this tool + action?
2. **Rate limit** — Redis token bucket per tool (and per account) respecting provider limits.
3. **Budget check** — per-run/day $ cap (doc 02 §8.3).
4. **Idempotency** — outward/destructive calls require an `idempotency_key`; dedupe via
   `tool_calls` unique index (doc 04 §5.5).
5. **Timeout + retry** — per tool policy (doc 06 §7).
6. **Circuit breaker** — open on sustained failure; degrade dependents (doc 03 §11.5).
7. **Audit + cost** — record `tool_calls` + `cost_ledger` rows.

### 2.2 Standard tool contract

Every tool documents: **id, capability, auth, scopes, inputs (schema), outputs (schema),
rate limits, idempotency, failure modes, cost, and which agents may call it.**

## 3. Tool registry (overview)

| Category | Tools |
|----------|-------|
| **Publishing/Analytics** | Instagram Graph API (publish, insights, comments, public_read) |
| **Design** | Canva (templates, edit, export), Google Drive (asset storage) |
| **Research** | Firecrawl (crawl), Exa (neural search), Perplexity (Q&A), Reddit, YouTube |
| **Models** | OpenRouter (multi-model), Claude, OpenAI (generation + embeddings) |
| **Data/Infra** | Supabase (DB/auth/storage), Postgres/pgvector (internal), Redis |
| **Notifications** | Slack, Discord, Resend (email) |
| **Knowledge/PM** | Notion, Linear |
| **Product analytics** | PostHog |
| **Source control** | GitHub, Git (for the build/deploy loop, not runtime content) |

Not every tool is in the runtime hot path; some (GitHub/Linear/Notion) support ops and
reporting. Each is behind the same guard middleware.

## 4. Publishing & analytics tools

### 4.1 Instagram Graph API

- **id(s):** `instagram.publish`, `instagram.insights`, `instagram.comments`,
  `instagram.public_read`.
- **Capability:** publish media (image/carousel/reel where API supports), read insights,
  read comments, read public competitor content (subject to API/ToS).
- **Auth:** long-lived access token for a Business/Creator account; refreshed by Tool
  Manager; stored in vault.
- **Scopes:** minimum needed (content publishing, insights). No cross-account access.
- **Idempotency:** `instagram.publish` REQUIRES an `idempotency_key`; a `(asset_id,
  platform)` unique constraint (doc 04 §7.3) plus pre-publish state check prevents doubles.
- **Rate limits:** per-app/user; publish volume is limited by the API — Scheduler respects
  daily caps; Tool Manager tracks `rate_remaining`.
- **Failure modes:** token expiry (refresh + retry), rate limit (backoff + reschedule),
  unsupported media (fall back to manual-assist + notify), transient 5xx (retry).
- **Degradation:** if publishing API is unavailable for a media type, COS schedules and
  notifies the operator to publish manually, and still collects analytics afterward.
- **Callers:** `cross_platform_publisher` (publish), `instagram_analyst` (insights/comments),
  `competitor_analyst` (public_read).
- **Cost:** API is free-tier bounded; cost is rate/complexity, not $.

### 4.2 Other platform adapters (LinkedIn, TikTok, X, YouTube, Threads)

- Behind a common **PublisherAdapter** interface: `publish(asset, target) → {externalId,
  permalink}` and `insights(externalId) → metrics`.
- v1: Instagram fully implemented; others stubbed/partial per API availability (doc 01 §7).
- Adapter pattern isolates platform quirks so agents don't change when a platform does.

## 5. Design tools

### 5.1 Canva

- **id(s):** `canva.create-design-from-brand-template`, `canva.perform-editing-operations`,
  `canva.export-design`, `canva.get-design-content`, `canva.search-brand-templates`.
- **Capability:** create designs from Zentrix brand templates, inject copy/assets, edit,
  export to PNG/PDF/MP4.
- **Auth:** Canva account OAuth scoped to the Zentrix brand kit.
- **Idempotency:** design creation keyed by `asset_id + version` to avoid duplicate designs.
- **Failure modes:** template missing (fall back to a base template), export timeout (retry),
  quota (backoff).
- **Callers:** `canva_designer`, `thumbnail_creator`, `layout_designer`, `visual_qa`
  (read-only), `design_lead`.

### 5.2 Google Drive (asset storage)

- **id(s):** `drive.upload`, `drive.get`, `drive.share`.
- **Capability:** durable storage of exported assets and large artifacts (alt: Supabase
  Storage). Returns stable links stored on `assets.design`.
- **Auth:** service account scoped to a Zentrix content folder.

## 6. Research tools

### 6.1 Firecrawl — `firecrawl.crawl`, `firecrawl.scrape`

- Crawl/scrape web pages for trend & competitor research; returns clean markdown/text.
- Rate-limited; results cached (content-hash) to avoid recrawl.
- Callers: `trend_researcher`, `competitor_analyst`, `market_intelligence`.

### 6.2 Exa — `exa.search`

- Neural/semantic web search for high-signal sources.
- Callers: strategy specialists.

### 6.3 Perplexity — `perplexity.ask` (optional)

- Grounded Q&A with citations for quick factual lookups.
- Callers: `market_intelligence`.

### 6.4 Reddit — `reddit.search`, `reddit.top`

- Read trending discussions in relevant subreddits (trading, forex, prop firms).
- Respect Reddit API terms and rate limits; read-only.
- Callers: `trend_researcher`, `audience_researcher`.

### 6.5 YouTube — `youtube.search`, `youtube.trending`

- Discover trending formats/topics; read public video metadata.
- Callers: `trend_researcher`.

## 7. Model access

### 7.1 OpenRouter — `openrouter.generate`, `openrouter.embed`

- **Capability:** unified access to multiple model providers; per-stage model routing
  (doc 09) with automatic fallback on provider outage.
- **Auth:** OpenRouter API key in vault.
- **Failure modes:** provider outage → route to fallback; rate limit → backoff; context
  overflow → summarise/trim (doc 05).
- **Cost:** primary $ driver; every call recorded to `cost_ledger`; per-stage caps enforced.
- **Callers:** all generating agents (via the executor), plus embeddings for memory/KB.

### 7.2 Claude / OpenAI (direct)

- Direct provider access for cases needing specific model features; same guard middleware,
  same cost accounting. Default routing prefers frontier Claude models for high-tier agents
  (doc 03 §12.4, doc 09).

## 8. Data & infra tools

### 8.1 Supabase — `supabase.*`

- DB (Postgres/pgvector), Auth, Storage. The control plane uses Supabase client libs; the
  worker uses a service role. Not a "hallucination risk" tool — it's system-of-record access
  gated by RLS (doc 04 §12).

### 8.2 Redis — internal

- Queues (BullMQ), rate-limit buckets, caches, pub/sub. Not agent-callable; infrastructure.

## 9. Notification tools

### 9.1 Slack — `slack.send`

- Post to configured channels (approvals, alerts, weekly report). OAuth bot token, scoped.
- Caller: `notification_manager` only.

### 9.2 Discord — `discord.send`

- Same role for a Discord server (community/ops). Webhook or bot token.
- Caller: `notification_manager`.

### 9.3 Resend — `resend.send`

- Transactional email (weekly report, critical alerts). Domain-verified sender.
- Caller: `notification_manager`.

## 10. Knowledge / project tools

### 10.1 Notion — `notion.search`, `notion.create`, `notion.update`

- Read brand/knowledge pages into the KB; write weekly reports/summaries where the team
  works in Notion. Scoped to a Zentrix workspace.
- Callers: `analytics_lead` (reports), KB ingest jobs (doc 11).

### 10.2 Linear — `linear.create_issue`, `linear.update`

- File engineering/ops tasks from system health incidents (optional).
- Caller: `ops_lead`.

## 11. Product analytics

### 11.1 PostHog — `posthog.capture`, `posthog.query`

- Capture content and app events; query funnels for the dashboard.
- Used by both the app (usage analytics) and the analytics engine (doc 13) as a secondary
  source; Instagram insights remain the primary content-metric source.

## 12. Source control (build/ops, not content runtime)

### 12.1 GitHub / Git

- Used by the build/deploy loop (doc 15) and by the implementing coding agent (doc 16), not
  by content agents at runtime. Listed for completeness of the tool surface.

## 13. Permissions matrix (tool → allowed agents)

| Tool | Allowed agents |
|------|----------------|
| `instagram.publish` | `cross_platform_publisher` |
| `instagram.insights` | `instagram_analyst` |
| `instagram.public_read` | `competitor_analyst` |
| `canva.*` (write) | `canva_designer`, `thumbnail_creator`, `layout_designer`, `design_lead` |
| `canva.get-design-content` | + `visual_qa` |
| `firecrawl.*`, `exa.search`, `reddit.*`, `youtube.*` | strategy specialists |
| `openrouter.generate` | all generating agents |
| `openrouter.embed` | memory/KB services |
| `slack.send`, `discord.send`, `resend.send` | `notification_manager` |
| `db.write_*` (scoped) | per doc 03 (e.g., `db.write_schedule` → scheduler) |
| `linear.*` | `ops_lead` |

Any call outside this matrix is denied by the guard middleware and audited.

## 14. Secrets management

- All credentials in the deploy platform's secret manager / Supabase Vault — never in DB
  rows, code, logs, or memory (doc 05 §11).
- Tool Manager reads secret **status** (present/valid/expiring), not values (doc 03 §11.5).
- Rotation: tokens (esp. Instagram long-lived) refreshed on schedule; failures alert Ops.

## 15. Adding a new tool (procedure)

1. Stand up/attach the MCP server; define typed input/output schemas.
2. Register the tool id + contract (this doc's template) in the registry.
3. Add permissions (which agents) and rate-limit/idempotency config.
4. Add health-check + breaker wiring for Tool Manager.
5. Add cost mapping for `cost_ledger`.
6. Validate in staging with a sandbox account; then enable.

## 16. Failure & degradation summary

| Tool down | Degradation |
|-----------|-------------|
| Instagram publish | schedule + manual-assist notify; analytics still collected later |
| Model provider | OpenRouter fallback; if all down, pause affected runs + alert |
| Canva | fall back to simpler template or hold design stage for HITL |
| Research tools | use cached/last-known + flag staleness |
| Notifications | fall back to in-app; retry external |

## 17. Open questions

- OQ-01 Which non-IG platform adapters ship in H1 vs stubbed (ties to doc 01 OQ-01)?
- OQ-02 Perplexity vs Exa+Firecrawl only for factual grounding — evaluate cost/quality.
- OQ-03 Drive vs Supabase Storage as the asset store of record — pick one, adapter the other.

*End of document 08.*
