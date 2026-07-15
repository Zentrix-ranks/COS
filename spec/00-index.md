# COS Specification — Master Index

**Product:** COS (Content Operating System) for Zentrix
**Document set version:** 1.0
**Status:** Baseline blueprint (pre-implementation)
**Owner:** Zentrix
**Audience:** Engineering, product, and the implementing coding agent (Claude Code)

---

## 0.1 Purpose of this document set

This is the authoritative, pre-implementation specification for COS. It is intentionally
written *before code* so that implementation is mechanical and architectural drift is
minimised. Every screen, agent, workflow, table, endpoint, permission, job, and
automation is defined here in enough detail that a competent engineer — or an
autonomous coding agent — can build it without inventing architecture.

Rule of the house: **update the spec first, then the code.** If code and spec disagree,
the spec is wrong until amended, and the code is wrong until it matches.

## 0.2 Document map

| #  | File | Title | Target pages |
|----|------|-------|-------------:|
| 00 | `00-index.md` | Master Index (this file) | 6 |
| 01 | `01-vision-and-prd.md` | Vision & Product Requirements | 28 |
| 02 | `02-system-architecture.md` | System Architecture Specification | 34 |
| 03 | `03-agent-architecture.md` | Agent Architecture Document | 46 |
| 04 | `04-database-schema.md` | Database Schema | 40 |
| 05 | `05-memory-system.md` | Memory System Specification | 26 |
| 06 | `06-workflow-engine.md` | Workflow Engine Specification | 28 |
| 07 | `07-dashboard-ux-ui.md` | Dashboard UX/UI Specification | 34 |
| 08 | `08-tool-integration.md` | Tool Integration Specification | 30 |
| 09 | `09-prompt-library.md` | Prompt Library | 30 |
| 10 | `10-agent-communication-protocol.md` | Agent Communication Protocol | 22 |
| 11 | `11-knowledge-base-structure.md` | Knowledge Base Structure | 22 |
| 12 | `12-content-pipeline-blueprint.md` | Content Pipeline Blueprint | 28 |
| 13 | `13-analytics-engine.md` | Analytics Engine Specification | 26 |
| 14 | `14-automation-and-scheduling.md` | Automation & Scheduling Specification | 22 |
| 15 | `15-deployment-guide.md` | Deployment Guide | 20 |
| 16 | `16-claude-code-master-build-prompt.md` | Claude Code Master Build Prompt | 18 |
| A1 | `A1-api-reference.md` | API Reference (appendix to 02/07) | 22 |
| A2 | `A2-agent-contracts.md` | Agent Contract Seed Data — all 35 agents (appendix to 03) | 30 |
| — | **Total** | | **300–500 pages (see note)** |

### Note on length

The specification is organised as the 16-document engineering package (plus this index and
appendices) that the founding conversation calls for. It is written to be **implementation-
grade**: dense with SQL schemas, API contracts, agent-contract JSON, ASCII/Mermaid diagrams,
and prompt blocks. Because code, tables, and diagrams paginate at far fewer words per page
than prose (~150–250 vs ~450), the rendered page count is materially higher than the raw word
count implies.

This baseline (v1.0) is the **complete structural blueprint**: every document, every agent,
every pipeline stage, every table, and every endpoint is specified. The per-document "target
pages" above represent the fully-expanded blueprint in the **300–500+ page** band; the baseline
realises the full structure and is designed to be expanded section-by-section (deeper per-agent
prompt texts, per-endpoint examples, per-screen component specs, per-table column dictionaries)
to reach the upper end of that range without changing the architecture. The appendices (A1, A2)
are the first tranche of that expansion. Expansion is additive: the skeleton does not change,
only its depth.

## 0.3 How to read

- **Product & business readers:** 01, 07, 12, 13.
- **Platform engineers:** 02, 04, 05, 06, 08, 10, 15.
- **Agent / prompt engineers:** 03, 09, 10, 11.
- **The implementing agent:** read everything, then start from 16.

## 0.4 Conventions used across all documents

- **MUST / SHOULD / MAY** follow RFC 2119 meaning.
- **Identifiers** use `snake_case` for DB columns, `camelCase` for TS variables,
  `PascalCase` for TS types/components, `kebab-case` for routes and file names.
- **Agent IDs** are stable slugs, e.g. `ceo`, `creative_director`, `hook_writer`.
- **Every table** in doc 04 has: purpose, columns, keys, indexes, and RLS notes.
- **Every agent** in doc 03 has the 11-part contract: Goal, Responsibilities, Tools,
  Inputs, Outputs, Memory, Permissions, Communication channels, Retry logic, Failure
  handling, Evaluation metrics.
- **Every external tool** in doc 08 has: capabilities, auth, rate limits, MCP surface,
  failure modes, and cost notes.
- **Diagrams** are ASCII or Mermaid so they render anywhere and diff cleanly in git.

## 0.5 Glossary

| Term | Meaning |
|------|---------|
| **Agent** | A bounded autonomous worker with a single job and an 11-part contract. |
| **Department** | A group of agents under a department head (a manager agent). |
| **Pipeline** | The fixed 20-stage path every content asset travels. |
| **Run** | One execution of a workflow graph for one unit of work. |
| **Job** | A queued background unit of work (BullMQ). |
| **Episode** | One recorded task attempt stored in episodic memory. |
| **Recall** | Vector-similarity retrieval of prior work from memory. |
| **Mission Control** | The top-level dashboard. |
| **Asset** | A single piece of content (reel, carousel, story, image, caption…). |
| **HITL** | Human-in-the-loop approval checkpoint. |

## 0.6 Change control

1. Propose a change as a PR that edits the relevant spec doc.
2. Bump the document set version in this index if the change is cross-cutting.
3. Only after the spec merges may the corresponding code change be opened.

## 0.7 Open questions register

Each document ends with an **Open Questions** section. Unresolved questions are mirrored
here at release time. At v1.0 baseline, all blocking questions are resolved; non-blocking
questions are tracked per-document.
