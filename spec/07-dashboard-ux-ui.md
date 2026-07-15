# 07 — Dashboard UX/UI Specification

**Document:** 07 of 16 · **Status:** Baseline · **Owner:** Product Design + Frontend

---

## 1. Purpose & north star

COS's interface is a **mission-control dashboard**, not a chat box. Opening COS should feel
like walking into the control room of a company: at a glance you see how the day is going,
what every "employee" (agent) is doing, what needs your decision, and what the system has
learned. This document specifies information architecture, every screen, components, states,
interactions, realtime behaviour, and accessibility.

## 2. Design principles

1. **Glanceable first.** The most important truths (progress, approvals, health) are visible
   without scrolling or clicking.
2. **Decisions, not dashboards.** Surface what needs a human decision and make it one click.
3. **Transparency on demand.** Every number and agent action can be drilled into (Run
   Inspector). Trust is earned by explainability.
4. **Calm by default.** Motion is subtle; notifications are batched; red means red.
5. **Department metaphor.** Navigation mirrors the org (doc 03): departments are places.
6. **Live.** State updates in realtime; the room feels alive without being noisy.

## 3. Design system

- **Framework:** Next.js App Router (RSC for data, client components for interactivity).
- **Styling:** Tailwind CSS + **shadcn/ui** primitives; Radix under the hood for a11y.
- **Theme:** dark-first control-room aesthetic with light theme parity; theme-aware tokens.
- **Type:** one sans family (e.g., Inter) with a tabular-figures variant for metrics.
- **Color tokens:** neutral surface scale + semantic (success/green, warning/amber,
  danger/red, info/blue) + department accent hues. Status uses semantic colors consistently
  (see doc 13/dataviz guidance for chart palettes).
- **Grid:** 12-col responsive; content max-width for readability; cards on an 8px spacing scale.
- **Icons:** a single icon set (e.g., Lucide).
- **Charts:** follow the `dataviz` guidance — one consistent chart system, accessible in both
  themes, prescriptive annotations where relevant.

### 3.1 Core components (shadcn-based)

Card, StatTile, ProgressBar, Badge/StatusPill, AgentStatusRow, TaskQueueItem,
NotificationItem, DataTable, Tabs, Sheet/Drawer (Run Inspector, Approval detail), Dialog,
Toast, Calendar, Timeline, Kanban column, Command palette (⌘K), Chart primitives.

## 4. Information architecture

```
App
├── Mission Control (home)
├── Departments
│    ├── Strategy
│    ├── Creative
│    ├── Design
│    ├── Publishing
│    ├── Analytics
│    └── Operations
├── Content
│    ├── Assets (all)
│    ├── Calendar
│    └── Approvals (queue)
├── Insights
│    ├── Analytics
│    └── Weekly Reports
├── Runs (activity + Run Inspector)
└── Settings (brand, tools, budgets, automation, users)
```

Global chrome: left nav (departments + sections), top bar (search/⌘K, notifications,
health pill, user), and a persistent "system heartbeat" indicator.

## 5. Screen: Mission Control (home)

Mirrors the founding sketch. Layout (desktop):

```
┌───────────────────────────────────────────────────────────────────────────┐
│  ZENTRIX OS · Content Operating System            [health: Excellent ●]     │
├───────────────┬───────────────┬───────────────┬───────────────────────────┤
│ Today's       │ Content       │ Pending       │ Scheduled                  │
│ Progress 82%  │ 18 / 22       │ Reviews  4    │ Posts  9                   │
│ ████████░░    │               │               │                            │
├───────────────┴───────────────┴───────────────┴───────────────────────────┤
│ Departments:  Strategy · Research · Creative · Design · Publishing ·        │
│               Analytics · Operations           (each a clickable tile)      │
├───────────────────────────────────┬───────────────────────────────────────┤
│ Running Agents (live)             │ Task Queue                             │
│  ● CEO Agent        Thinking…     │  ✓ Weekly Market Report                │
│  ● Creative Dir.    Reel #52      │  ✓ Reel #18                            │
│  ● Trend Analyst    Reddit        │  ✓ Carousel #44                        │
│  ● IG Analyst       Metrics       │  ○ Hook Optimisation                   │
│  ● Canva Agent      Carousel      │  ○ Competitor Analysis                 │
├───────────────────────────────────┴───────────────────────────────────────┤
│ Notifications:  ⚑ New Trend Detected · ↑ IG Reach +27% · ⏱ Best time updated │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Components & data

| Region | Component | Source |
|--------|-----------|--------|
| KPI row | 4× `StatTile` (+`ProgressBar` for progress) | `v_today_progress` (doc 04) |
| Health pill | `StatusPill` | `health_snapshots.ig_health`/`overall` |
| Departments | 7× tile with live count + status dot | per-dept rollups |
| Running Agents | `AgentStatusRow` list, live | `v_running_agents` + realtime events |
| Task Queue | `TaskQueueItem` list (✓ done, ○ pending) | `tasks` |
| Notifications | `NotificationItem` strip | `notifications` |

### 5.2 Realtime behaviour

- Running Agents and Task Queue update via SSE/WebSocket (doc 02 §3.1). Each agent row shows
  a live verb ("Generating Reel #52", "Analyzing Reddit") derived from the latest `run_step`.
- Subtle pulse animation on active rows; no layout shift on update.
- Clicking an agent row opens the **Run Inspector** for its current run.

### 5.3 States

- **Loading:** skeletons for each region.
- **Empty (fresh install):** friendly setup checklist (connect tools, seed brand, run first
  day).
- **Degraded:** health pill amber/red; a banner explains what's down and what's degraded.

## 6. Screen: Department workspace (generic pattern)

Each department opens into its own workspace with department-specific tabs. Shared pattern:
header (department name, status, its agents), tabbed content, and a right-rail activity feed.

### 6.1 Creative Department

Tabs: **Ideas · Hooks · Captions · Scripts · Reels · Carousels · Images · Videos · Templates
· Brand Voice**

- **Ideas:** Kanban (proposed → prioritized → drafting → dropped); each card shows source
  (trend/competitor/recommendation), priority score, format.
- **Hooks:** list of hook candidates with scores + "winner" tags; filter by format; shows
  recalled winning hooks (memory) inline.
- **Reels/Carousels/etc.:** asset galleries by type with status pills; click → asset detail.
- **Brand Voice:** editable brand-voice rules (writes to `memory_semantic`/KB); shows recent
  operator corrections the system learned from.

### 6.2 Analytics Department

Tabs: **Views · Watch Time · Saves · Shares · CTR · Followers · Reach · Recommendations ·
Weekly Reports** (see doc 13 for the analytics semantics).

- Each metric tab: time-series chart + top/bottom assets + cluster breakdown.
- **Recommendations:** ranked cards ("Make more of X", evidence, confidence) with
  Accept/Reject → feeds ideation (doc 13).
- **Weekly Reports:** rendered report with highlights + recommendations + KPIs; export/share.

### 6.3 Publishing Department

Tabs (platforms): **Instagram · LinkedIn · TikTok · X · YouTube · Threads** plus a
**Calendar** and **Automation** view.

- Per-platform: queued/scheduled/published assets, publish status, external permalinks.
- Calendar: month/week views; drag to reschedule (writes `schedules`); collision warnings.
- Automation: the daily loop status, cron schedule, last runs, toggles (doc 14).

### 6.4 Strategy / Design / Operations

- **Strategy:** Trends feed, Competitor board, Personas, Market intelligence facts.
- **Design:** design queue, Canva assets, Visual-QA results with annotated issues.
- **Operations:** tool status matrix, health, cost dashboard, memory/DB maintenance, logs.

## 7. Screen: Approvals queue

The operator's most-used surface (human-by-exception).

- List of assets `waiting_approval` with a compact preview (hook, first slide/thumbnail,
  format, confidence, why-flagged).
- One-click **Approve / Request changes / Reject**; optional note (learned from — doc 05).
- Bulk approve for high-confidence batches (guarded by policy).
- Approving enqueues publish/schedule; UI updates live.
- Keyboard-driven: `j/k` navigate, `a` approve, `r` request changes, `x` reject.

### 7.1 Asset detail / approval drawer

A `Sheet` showing: full content (slides/script/caption/CTA), design preview, all pipeline
stage results (brand/grammar/SEO/IG/visual QA pass-fail with notes), confidence, memories
used, and the proposed schedule + rationale. This is where a human can trust-but-verify.

## 8. Screen: Runs & Run Inspector

- **Runs list:** recent/active runs with graph, status, cost, duration.
- **Run Inspector** (`Sheet`/full page): the timeline of `run_steps` — each node with its
  agent, input, reasoning summary, tool calls (args/results/latency/cost), output, and
  where an HITL interrupt occurred. Shows the graph path taken and memories/KB used.
- Actions: retry from checkpoint, cancel, escalate.

This is the transparency backbone: any dashboard number links to the run that produced it.

## 9. Screen: Settings

Sections: **Brand** (voice, palette, typography, disclaimers), **Tools** (connect/status of
MCP integrations, doc 08), **Budgets** (daily/run $ caps, alerts), **Automation** (daily loop
schedule, auto-approve policy + confidence thresholds), **Users & roles** (owner/admin/
editor/viewer), **Notifications** (channels, quiet hours, severity routing).

## 10. Global patterns

### 10.1 Command palette (⌘K)

Jump to any department/asset/run; run actions ("approve next", "pause operation", "generate
weekly report"); search assets/trends.

### 10.2 Notifications

Top-bar bell + optional Slack/Discord/email (doc 03 §11.4). Batched, deduped, severity-
colored. Critical items (tool outage, budget cap, approval SLA breach) surface as a banner.

### 10.3 Status vocabulary (consistent everywhere)

| Pill | Meaning |
|------|---------|
| ○ pending / queued | not started |
| ● running (pulse) | in progress |
| ⏸ paused (HITL) | waiting on human |
| ✓ done / published | complete |
| ⚠ needs changes | revision loop |
| ✕ failed / rejected | terminal negative |

## 11. Responsiveness & layout

- **Desktop (≥1280):** full mission control with side-by-side regions.
- **Tablet:** stacked regions; nav collapses to icons.
- **Mobile:** priority stack — KPIs, Approvals, Notifications, Running Agents; departments via
  a bottom nav; Approvals fully usable on mobile (approve on the go).
- No horizontal page scroll; wide tables/charts scroll within their own container.

## 12. Accessibility (WCAG 2.1 AA)

- Full keyboard operability (nav, approvals, palette).
- Color is never the only signal (icons + text accompany status colors).
- Contrast AA in both themes; focus-visible rings; reduced-motion honored.
- Charts include accessible summaries/tables (dataviz skill guidance).
- Live regions announce important realtime changes (e.g., "new approval pending").

## 13. Empty, loading, and error states (global rules)

- Every data region defines skeleton (loading), empty (with a helpful next action), and error
  (with retry + link to Ops) states.
- Never show a bare spinner where a skeleton communicates structure.

## 14. Frontend data & realtime contracts

- **Reads:** RSC server components fetch from the API groups in doc 02 §7.
- **Mutations:** server actions / API routes; optimistic UI with rollback on failure.
- **Realtime:** subscribe to `/api/stream` (SSE) channels: `agents`, `queue`, `notifications`,
  `runs:<id>`. Events carry minimal deltas; client reconciles.

## 15. Component inventory → data mapping (build checklist)

| Component | Route | API/view |
|-----------|-------|----------|
| `StatTile` KPIs | `/` | `GET /api/overview` |
| `AgentStatusRow` | `/` | `GET /api/agents/status` + SSE `agents` |
| `TaskQueueItem` | `/` | `GET /api/queue` + SSE `queue` |
| Approvals list | `/content/approvals` | `GET /api/approvals` |
| Approval decision | `/content/approvals` | `POST /api/approvals/:id/decision` |
| Calendar | `/content/calendar` | `GET/PATCH /api/schedules` |
| Recommendations | `/insights/analytics` | `GET /api/analytics/recommendations` |
| Weekly report | `/insights/reports/:id` | `GET /api/reports/weekly/:id` |
| Run Inspector | `/runs/:id` | `GET /api/runs/:id/trace` |
| Tool status | `/settings/tools` | `GET /api/tools/status` |

## 16. Open questions

- OQ-01 Brand name in-product: "Zentrix OS" (per sketch) vs "COS" — use "Zentrix OS" as the
  product surface, "COS" as the repo/spec name.
- OQ-02 Drag-to-reschedule on mobile — defer to tap-to-edit on small screens.
- OQ-03 How much reasoning to expose in Run Inspector by default vs behind a toggle.

*End of document 07.*
