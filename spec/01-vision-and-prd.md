# 01 — Vision & Product Requirements Document (PRD)

**Document:** 01 of 16 · **Status:** Baseline · **Owner:** Product

---

## 1. Executive summary

COS (Content Operating System) is an autonomous, agent-based platform that runs
Zentrix's content operation the way a well-run company runs a department: with a
leadership hierarchy, specialised workers, shared memory, standard operating
procedures, and a control room. It replaces the "prompt a chatbot, copy-paste the
output" loop with a **self-driving pipeline** that detects trends, generates ideas,
writes and designs content, routes it through review, schedules and publishes it,
measures results, and **learns** — updating its own memory so tomorrow's output is
better than today's.

COS is not a chatbot with extra steps. It is modelled as an **internal company** of
~35 cooperating agents across seven departments, coordinated by a CEO Agent and surfaced
through a **mission-control dashboard** rather than a chat interface.

### 1.1 One-paragraph pitch

> Zentrix opens COS in the morning and sees a control room: today's progress, what each
> agent is doing right now, the task queue, pending approvals, and fresh insights. The
> system has already scanned trends and competitors overnight, drafted the day's
> content, and queued what's ready. Zentrix approves a few items, tweaks one hook, and
> closes the laptop. Content ships on schedule, analytics flow back in, and the system
> gets measurably smarter every week.

## 2. Problem statement

Zentrix produces high-volume, high-craft content (trading education, market structure,
SMC concepts, prop-firm guidance) across Instagram and other platforms. The current
reality — like most creator operations — has structural problems:

1. **Cognitive load is centralised.** Every idea, hook, script, and design decision
   flows through one or two people. Throughput is capped by human attention.
2. **No institutional memory.** Winning hooks, failed formats, and audience reactions
   live in people's heads and scattered notes. The operation re-solves solved problems.
3. **Analytics are descriptive, not prescriptive.** Dashboards count likes; they do not
   say *"carousels with a contrarian hook posted at 7pm outperform by 34% — make more."*
4. **Tooling is fragmented.** Research, writing, design, scheduling, and analytics live
   in separate tabs with manual handoffs and lossy copy-paste.
5. **Scaling means hiring.** Doing 3× the output today means 3× the people.

## 3. Vision

A content operation that behaves like a disciplined company and improves itself:

- **Autonomous by default, supervised by exception.** The system runs the daily loop on
  its own; humans intervene only at defined approval gates or when confidence is low.
- **Memory-first.** Every task consults prior work. Nothing starts from a blank page.
- **Prescriptive analytics.** Insight is expressed as *next actions*, not vanity metrics.
- **One control room.** A single dashboard shows the whole operation and lets a human
  steer without touching ten tools.
- **Compounding quality.** Each cycle updates memory and the knowledge base, so output
  quality trends upward without more human hours.

### 3.1 Vision in three horizons

| Horizon | Timeframe | State |
|--------|-----------|-------|
| **H1 — Assisted** | Launch → 8 weeks | Agents draft; humans approve most items; memory begins accumulating. |
| **H2 — Supervised autonomy** | 2 → 6 months | System runs the daily loop; humans approve by exception; analytics drive the calendar. |
| **H3 — Self-optimising** | 6+ months | The recommendation engine reprioritises the roadmap; the system proposes format experiments and measures them. |

## 4. Goals & non-goals

### 4.1 Goals

- G1. Automate the full content lifecycle from trend to published asset to learning.
- G2. Provide a mission-control dashboard as the primary interface.
- G3. Give every agent durable, searchable memory (vector recall over past work).
- G4. Make analytics prescriptive via pattern discovery and a recommendation engine.
- G5. Keep a human in the loop at defined approval gates with one-click actions.
- G6. Be tool-grounded — agents call real APIs, they do not hallucinate facts/metrics.
- G7. Be incrementally implementable against this spec with minimal ambiguity.

### 4.2 Non-goals (v1)

- N1. Fully hands-off publishing with **no** human approval option (approval is always
  available, even when auto-approve is enabled).
- N2. A general-purpose chat assistant. COS has assistive chat surfaces but the product
  is the control room, not the chat box.
- N3. Building our own foundation models. We route to models via OpenRouter/Claude/OpenAI.
- N4. Full video *rendering/editing* automation. v1 plans and specs motion; it does not
  render final edited video in-house (it can brief external tools).
- N5. Multi-tenant SaaS. v1 is single-tenant for Zentrix. Multi-tenancy is a later theme.

## 5. Target users & personas

| Persona | Role | Primary needs | Primary surfaces |
|---------|------|---------------|------------------|
| **Owner / Operator (Zentrix)** | Approves, steers, sets direction | See status at a glance; approve/reject fast; trust the output | Mission Control, Approvals, Analytics |
| **Content Lead** | Shapes voice & calendar | Adjust briefs, brand voice, calendar; review drafts | Creative & Publishing workspaces |
| **Analyst (may be the owner)** | Reads results, sets bets | Prescriptive insights; weekly report; experiment results | Analytics workspace |
| **Admin / Engineer** | Keeps it running | Health, tool status, logs, secrets, deploys | Operations workspace, Deployment |

### 5.1 Primary persona detail — Owner/Operator

- Time-poor; wants *decisions surfaced*, not raw data.
- Trusts the system in proportion to transparency: must always see *why* an agent did
  something and be able to override.
- Success feels like: "I spent 20 minutes and shipped a great day of content."

## 6. Product principles

1. **Organisation over automation.** Model the operation as a company; automation is the
   consequence, not the goal.
2. **Memory before generation.** Recall first, generate second.
3. **Tools over hallucination.** If a fact or metric can be fetched, it MUST be fetched.
4. **Prescriptive over descriptive.** End every analysis with a recommended action.
5. **Human-by-exception.** Default to autonomy; escalate on low confidence or high stakes.
6. **Transparency.** Every agent action is inspectable: inputs, reasoning summary, tools
   called, outputs, cost.
7. **Idempotent & resumable.** Any run can be retried safely; nothing double-publishes.
8. **Brand-safe by construction.** Brand voice and compliance checks are pipeline stages,
   not afterthoughts.

## 7. Scope

### 7.1 In scope (v1)

- The seven departments and ~35 agents defined in doc 03.
- The 20-stage content pipeline (doc 12).
- Mission Control + seven department workspaces (doc 07).
- PostgreSQL + pgvector data layer and memory system (docs 04, 05).
- LangGraph workflow engine with HITL gates (doc 06).
- MCP-based tool integration for the tool list in doc 08.
- Analytics engine with clustering + recommendations (doc 13).
- Daily automation loop, cron, and queues (doc 14).
- Instagram as the primary publishing/analytics target; other platforms behind adapters.

### 7.2 Out of scope (v1)

- Native mobile apps (responsive web only).
- In-house video rendering/editing.
- Paid-ads management.
- Multi-tenant billing.

## 8. Functional requirements

Grouped by capability. Each has a stable ID used across the spec.

### 8.1 Trend & research (FR-RES)

- **FR-RES-01** The system MUST scan configured sources (Reddit, YouTube, web via
  Firecrawl/Exa, competitor accounts) on a schedule and detect emerging trends.
- **FR-RES-02** Each detected trend MUST be stored with source, timestamp, a relevance
  score, and supporting evidence links.
- **FR-RES-03** Competitor content MUST be tracked with cadence, format, and estimated
  performance signals.
- **FR-RES-04** Audience interests MUST be updated from engagement data and research.

### 8.2 Ideation & creative (FR-CRE)

- **FR-CRE-01** The system MUST generate content ideas linked to trends, audience
  interests, and knowledge-base themes.
- **FR-CRE-02** Ideas MUST be scored and prioritised before drafting.
- **FR-CRE-03** For each approved idea, the system MUST produce hooks, an outline, and a
  full draft appropriate to the target format (reel, carousel, story, image, caption).
- **FR-CRE-04** Every draft MUST pass brand-voice, grammar, SEO, and platform-optimisation
  checks as distinct pipeline stages, each recording pass/fail and edits.

### 8.3 Design (FR-DES)

- **FR-DES-01** The system MUST produce design specs and (where supported) generate
  designs via Canva for carousels, thumbnails, and image posts.
- **FR-DES-02** A visual-QA stage MUST verify legibility, safe-margins, brand palette,
  and typography before approval.

### 8.4 Approval & publishing (FR-PUB)

- **FR-PUB-01** Assets MUST route to a human approval gate unless auto-approve is enabled
  for that asset type **and** confidence exceeds the configured threshold.
- **FR-PUB-02** Approved assets MUST be schedulable to optimal times and publishable to
  Instagram (and other adapters) with idempotency guarantees (no double posts).
- **FR-PUB-03** A calendar view MUST show scheduled, published, and draft assets.

### 8.5 Analytics & learning (FR-ANL)

- **FR-ANL-01** The system MUST collect post-publish metrics (views, watch time, saves,
  shares, CTR, reach, follower delta) per asset.
- **FR-ANL-02** The analytics engine MUST cluster the last N posts by topic, hook, CTA,
  length, design, and posting time, and surface winning patterns.
- **FR-ANL-03** The recommendation engine MUST convert patterns into concrete next-content
  recommendations that feed ideation.
- **FR-ANL-04** A weekly report MUST be generated and delivered (Slack/Discord/Email/Notion).

### 8.6 Memory & knowledge (FR-MEM)

- **FR-MEM-01** Every agent MUST record episodes (task, inputs, outputs, outcome) to
  memory.
- **FR-MEM-02** Agents MUST recall similar prior work via vector search before generating.
- **FR-MEM-03** The knowledge base MUST be queryable by all agents (RAG) with citations.

### 8.7 Control & governance (FR-GOV)

- **FR-GOV-01** Mission Control MUST show live agent status, task queue, progress, and
  notifications.
- **FR-GOV-02** Every agent action MUST be inspectable (inputs, tools, outputs, cost, time).
- **FR-GOV-03** Permissions MUST gate which agents can call which tools and take which
  actions (doc 03, doc 08).
- **FR-GOV-04** All destructive or outward-facing actions (publish, delete, external send)
  MUST be idempotent and audit-logged.

## 9. Non-functional requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Dashboard first meaningful paint < 1.5s on broadband; live status updates within 2s of state change. |
| **Throughput** | Sustain ≥ 40 content assets/day through the pipeline without manual batching. |
| **Reliability** | No double-publish ever; all outward actions idempotent; runs resumable after crash. |
| **Availability** | Control plane target 99.5% monthly; background workers degrade gracefully. |
| **Scalability** | Horizontal worker scaling via queue concurrency; DB read replicas when needed. |
| **Security** | Secrets in a managed vault; least-privilege tool permissions; RLS on all tenant data. |
| **Privacy** | Audience data handled per platform ToS; no scraping that violates provider terms. |
| **Observability** | Structured logs, run traces, per-agent metrics, cost accounting per run. |
| **Cost control** | Per-run and per-day token/$ budgets with hard caps and alerts. |
| **Accessibility** | WCAG 2.1 AA for the dashboard. |
| **Maintainability** | Spec-first; typed end-to-end; every agent behind a uniform contract. |

## 10. Success metrics (KPIs)

### 10.1 Product/operational KPIs

- **Throughput:** assets published/week (target: 5× pre-COS baseline within H2).
- **Human minutes per published asset:** target trending toward < 3 minutes at H2.
- **Approval pass-rate on first submission:** target ≥ 80% at H2 (proxy for draft quality).
- **Cycle time:** trend-detected → published median < 24h for evergreen, < 4h for reactive.

### 10.2 Growth KPIs (outcome)

- Instagram reach, saves, shares, and follower growth rate — tracked and attributed to
  content clusters by the analytics engine.

### 10.3 System KPIs

- Run success rate ≥ 98% (excluding intentional HITL holds).
- Mean tool-call failure rate < 2% with successful retry recovery ≥ 95%.
- Cost per published asset within configured budget.

## 11. User stories (representative)

- **US-01** As the Operator, I open COS and within 10 seconds understand what's done,
  what's pending my approval, and what each agent is doing.
- **US-02** As the Operator, I approve or reject a draft in one click, optionally leaving
  a note the agents will learn from.
- **US-03** As the Content Lead, I edit the brand voice rules and see subsequent drafts
  reflect them.
- **US-04** As the Analyst, I open the weekly report and see three concrete "make more of
  this" recommendations with evidence.
- **US-05** As the Admin, I see a tool go down (e.g., Instagram API), get notified, and
  watch the system degrade gracefully and retry.
- **US-06** As the Operator, I ask "why did we schedule this reel for 7pm?" and see the
  analytics rationale.

### 11.1 Acceptance criteria pattern

Each user story is "done" when: (a) the happy path works end-to-end through real tools
in staging; (b) the failure path degrades gracefully and is observable; (c) the action
is audit-logged; (d) relevant memory/analytics are updated.

## 12. Release plan / milestones

| Milestone | Contents | Exit criteria |
|-----------|----------|---------------|
| **M0 — Foundations** | Repo, CI/CD, DB schema, auth, MCP scaffolding, dashboard shell | A no-op agent runs end-to-end; schema migrated; dashboard renders live status. |
| **M1 — Single pipeline** | One department (Creative) + pipeline stages Draft→Approval for one format (carousel) | A carousel goes idea→draft→review→approval→schedule in staging. |
| **M2 — Publish & measure** | Publishing + Analytics collection for Instagram | An approved carousel publishes and metrics return and store. |
| **M3 — Learning loop** | Memory writes/recall + analytics clustering + recommendations | Recommendations from real metrics feed ideation; memory recall demonstrably used. |
| **M4 — Full org** | All departments/agents + all formats + daily automation | Daily loop runs unattended overnight; human-by-exception approvals. |
| **M5 — Hardening** | Cost caps, observability, resilience, accessibility, docs | NFRs met; runbooks exist; on-call-able. |

## 13. Assumptions

- Zentrix has (or will provision) accounts/API access for the tools in doc 08.
- Instagram Graph API access is available for a Business/Creator account; where an API
  capability is unavailable, the system falls back to scheduling + manual-assist.
- Model access via OpenRouter/Claude/OpenAI is funded and rate-limits are acceptable.

## 14. Constraints

- Platform API rate limits and ToS bound automation depth (esp. publishing/scraping).
- Model context limits bound how much memory/knowledge is injected per call (mitigated by
  retrieval + summarisation, doc 05).
- Budget caps bound daily generation volume.

## 15. Risks & mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Platform API changes/limits | Publishing/analytics break | Med | Adapter pattern (doc 08); graceful degradation; manual-assist fallback. |
| Model cost overruns | Budget blown | Med | Per-run/day caps; cheaper models for cheap stages; caching. |
| Brand-voice drift | Off-brand content ships | Med | Brand-voice stage + Visual QA + HITL; memory of corrections. |
| Over-automation erodes trust | Operator disengages | Low-Med | Transparency, human-by-exception, easy overrides, audit log. |
| Agent loops / runaway | Wasted spend, stuck runs | Med | Step/time budgets, retry caps, circuit breakers (docs 06, 10). |
| Data quality in analytics | Bad recommendations | Med | Minimum-sample thresholds; confidence scoring on patterns (doc 13). |
| Vendor lock-in | Hard to migrate | Low | MCP abstraction; standard Postgres; provider-agnostic model routing. |

## 16. Compliance & brand safety

- Content MUST pass a brand/compliance stage checking for prohibited claims (e.g.,
  guaranteed returns, financial-advice overreach) appropriate to trading education.
- Disclaimers MUST be attachable per format and enforced by the pipeline where required.
- The system MUST respect each platform's automation and content policies.

## 17. Dependencies on other spec documents

- Architecture → doc 02. Agents → doc 03. Data → doc 04. Memory → doc 05.
- Workflows → doc 06. UI → doc 07. Tools → doc 08. Prompts → doc 09.
- Comms → doc 10. Knowledge → doc 11. Pipeline → doc 12. Analytics → doc 13.
- Automation → doc 14. Deploy → doc 15. Build prompt → doc 16.

## 18. Open questions

- OQ-01 Which non-Instagram platforms are in the H1 publishing set vs. adapter-stubbed?
- OQ-02 What are the exact brand-compliance rules for trading claims (legal review)?
- OQ-03 Auto-approve: which asset types are eligible at launch, and at what confidence?
- OQ-04 Weekly report delivery channel of record (Slack vs Discord vs Notion vs Email)?

*End of document 01.*
