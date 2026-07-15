# COS — Content Operating System

> An autonomous, agent-based **Content Operating System** for Zentrix.
> This repository is the **engineering blueprint** that is produced *before* a single
> line of production code is written.

COS treats content production not as "an AI workflow" but as **an internal company**:
a hierarchy of specialised agents (a CEO Agent, department heads, and specialist
workers) with clearly defined goals, tools, memory, permissions, communication
channels, and evaluation metrics — all orchestrated through a fixed content pipeline
and surfaced through a **mission-control dashboard** instead of a chat box.

---

## Why this repository exists

The biggest mistake teams make is asking a coding agent to *"build an AI content
system."* That produces architectural drift, throwaway code, and a system nobody can
maintain.

COS inverts this. We first author a **complete software specification** — the
equivalent of what a 30–50 person product team would produce before development
starts. The specification defines **every screen, every agent, every workflow, every
database table, every API endpoint, every permission model, every background job,
every automation, and every interaction** in enough detail that implementation
becomes largely mechanical.

For a platform this ambitious, the specification is designed to span **300–500+
pages**. Once finalised, a coding agent (e.g. Claude Code) implements the system
incrementally against the blueprint. This dramatically reduces architectural drift
and makes the resulting codebase far more maintainable.

---

## Repository layout

```
.                                   ← COS repository root
├── README.md                       ← you are here
├── apps/
│   ├── web/                        ← Next.js control plane (Mission Control) — doc 02 §11
│   └── worker/                     ← agent runtime (BullMQ worker, no-op agent) — doc 02 §3.2
├── packages/
│   ├── db/                         ← schema, migrations, seed (36 agents) — doc 04
│   ├── shared/                     ← enums, message envelope, queue names — doc 04/10
│   ├── prompts/                    ← prompt library (doc 09) — to come
│   └── knowledge/                  ← KB loaders/embedders (doc 11) — to come
├── infra/                          ← IaC / deploy config (doc 15) — to come
├── docs/
│   ├── 00-origin-conversation.md   ← the founding conversation + the "extra step"
│   └── 01-implementation-notes.md  ← build progress + spec corrections discovered
└── spec/
    ├── 00-index.md                 ← master index + page-count map
    ├── 01-vision-and-prd.md
    ├── 02-system-architecture.md
    ├── 03-agent-architecture.md
    ├── 04-database-schema.md
    ├── 05-memory-system.md
    ├── 06-workflow-engine.md
    ├── 07-dashboard-ux-ui.md
    ├── 08-tool-integration.md
    ├── 09-prompt-library.md
    ├── 10-agent-communication-protocol.md
    ├── 11-knowledge-base-structure.md
    ├── 12-content-pipeline-blueprint.md
    ├── 13-analytics-engine.md
    ├── 14-automation-and-scheduling.md
    ├── 15-deployment-guide.md
    └── 16-claude-code-master-build-prompt.md
```

## The 16-document specification package

| #  | Document | Purpose |
|----|----------|---------|
| 01 | Vision & Product Requirements (PRD) | What we are building and why; personas, scope, success metrics |
| 02 | System Architecture Specification | Services, boundaries, data flow, infra topology |
| 03 | Agent Architecture Document | The org chart of agents; per-agent contracts |
| 04 | Database Schema | Every table, column, index, and relationship (PostgreSQL + pgvector) |
| 05 | Memory System Specification | Short/long-term, episodic, semantic, vector recall |
| 06 | Workflow Engine Specification | LangGraph state machines, retries, human-in-the-loop |
| 07 | Dashboard UX/UI Specification | Mission control + department workspaces |
| 08 | Tool Integration Specification | MCP tool contracts for every external service |
| 09 | Prompt Library | System/role/task prompts for every agent |
| 10 | Agent Communication Protocol | Message envelope, channels, routing, escalation |
| 11 | Knowledge Base Structure | Brand, trading, growth, and craft knowledge |
| 12 | Content Pipeline Blueprint | The 20-stage pipeline every asset flows through |
| 13 | Analytics Engine Specification | Pattern discovery, clustering, recommendations |
| 14 | Automation & Scheduling Specification | The daily loop, cron, queues, triggers |
| 15 | Deployment Guide | Environments, CI/CD, secrets, observability |
| 16 | Claude Code Master Build Prompt | The single prompt that drives incremental build |

## Technology stack (target)

Next.js · React · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · pgvector ·
Supabase (auth + storage) · LangGraph (agent orchestration) · Model Context Protocol
(MCP) · Vercel · OpenRouter (multi-model) · Redis · BullMQ · PostHog · Firecrawl · Exa
· Instagram Graph API.

## How to read this spec

1. Read `docs/00-origin-conversation.md` for the founding intent.
2. Read `spec/00-index.md` for the map and conventions.
3. Read documents 01 → 16 in order. Each is self-contained but cross-references others.

## Repository status

This specification package was originally authored inside the Zentrix repository and
has since been **migrated to this dedicated `COS` repository** (its permanent home).
The Zentrix repository no longer carries the COS blueprint.

Implementation now proceeds here, incrementally against the spec, milestone by
milestone (M0 → M5, per `spec/01-vision-and-prd.md` §12 and `spec/16-claude-code-master-build-prompt.md`).
See `spec/00-index.md` for the document map and conventions.

**Current milestone: M0 — Foundations (in progress).** The monorepo scaffold, the full
database schema + migrations, the 36-agent seed, shared types, a Mission Control shell, and a
no-op agent worker are in place; migrations + seed are verified end-to-end on Postgres +
pgvector. See `docs/01-implementation-notes.md` for exactly what is done, what remains to reach
the M0 Definition of Done, and the spec corrections discovered along the way.

### Quick start (developer)

```bash
npm install
npm run typecheck                       # all packages
psql "$DATABASE_URL" -f packages/db/local-dev-shim.sql   # plain-Postgres dev only (not Supabase)
npm run db:migrate && npm run db:seed   # needs a Postgres with pgvector; see packages/db/README.md
npm run dev:web                         # Mission Control at http://localhost:3000
npm run dev:worker                      # agent runtime (needs Redis)
```

---

*This is a living blueprint. Update the spec first, then the code.*
