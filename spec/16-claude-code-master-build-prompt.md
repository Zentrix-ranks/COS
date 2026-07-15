# 16 — Claude Code Master Build Prompt

**Document:** 16 of 16 · **Status:** Baseline · **Owner:** Engineering

---

## 1. Purpose

This is the single, authoritative prompt handed to Claude Code (or any capable coding agent)
to implement COS **incrementally against this specification**. It does not ask the agent to
"build an AI content system." It asks it to build a specified, documented system in
verifiable increments, checking each against the blueprint. The rule is unchanged: **the spec
is the source of truth; update the spec before the code.**

## 2. How to use this document

1. Ensure docs 00–15 are finalised and readable by the agent (same repo).
2. Give the agent the **Master Build Prompt** (§4) as its standing instruction.
3. Drive it milestone by milestone (M0→M5, doc 01 §12) using the **per-milestone prompts**
   (§6). Never ask for the whole system in one shot.
4. Require the **Definition of Done** (§5) for every increment.

## 3. Operating rules for the build agent

- **Spec-first:** read the relevant spec docs before writing code; if reality diverges,
  propose a spec change (PR) *before* coding around it.
- **Increment small, verify always:** one vertical slice at a time; prove it works end-to-end
  before moving on (use the repo's verify/run flow).
- **Typed end-to-end:** TypeScript strict; zod at boundaries; DB types generated from schema.
- **No orphan code:** every file traces to a spec section; delete dead code.
- **Tests + evals:** unit + contract + graph-simulation + prompt evals for anything nontrivial.
- **Idempotency & safety:** never implement an outward action without an idempotency key and
  audit log; never bypass permissions/RLS.
- **Observability from day one:** run steps, tool calls, cost logging wired as soon as the
  runtime exists.
- **Ask, don't guess:** if a spec Open Question blocks progress, surface it; don't invent
  irreversible architecture.

## 4. The Master Build Prompt

> **You are the implementing engineer for COS (Content Operating System) for Zentrix.**
>
> Your source of truth is the specification in `spec/` (documents 00–16) and the founding
> intent in `docs/00-origin-conversation.md`. Read the relevant documents before writing
> any code. Build the system described there — an autonomous, agent-based content operating
> system modelled as a company (CEO agent + 6 department heads + specialists), running a fixed
> 20-stage content pipeline, surfaced through a mission-control dashboard, backed by
> PostgreSQL + pgvector, orchestrated with LangGraph, integrated to tools via MCP, and
> deployed with Next.js on Vercel + workers on a persistent host.
>
> **Constraints & principles (non-negotiable):**
> - Implement **incrementally** against the spec, milestone by milestone (doc 01 §12). Do not
>   attempt the whole system at once.
> - **Spec is truth.** If you find a gap or contradiction, propose a spec edit (PR to the
>   relevant `spec/` doc) before coding around it.
> - **Memory before generation; tools over hallucination; human-by-exception; idempotent &
>   resumable; transparent.** (doc 01 §6.) Honor these in every slice.
> - Typed end-to-end (TS strict + zod); every outward action idempotent + audit-logged; RLS
>   and per-agent tool permissions enforced (docs 04 §12, 08 §13).
> - Wire observability (run steps, tool calls, cost) as soon as the runtime exists (doc 06 §11).
> - For every increment, deliver: code + migrations + tests/evals + a short note mapping the
>   work to spec sections, and prove it runs end-to-end.
>
> **Tech stack (target, doc 02 §4):** Next.js (App Router) + React + TypeScript + Tailwind +
> shadcn/ui; PostgreSQL + pgvector via Supabase (+ Auth/Storage); LangGraph; MCP for tools;
> OpenRouter (+ Claude/OpenAI) for models; Redis + BullMQ for jobs; PostHog; Firecrawl/Exa for
> research; Instagram Graph API for publishing/analytics; Vercel for the control plane +
> persistent host for workers.
>
> **Start with Milestone M0 (Foundations).** Confirm your understanding, list the files you'll
> create, then implement. After M0 passes its Definition of Done, proceed to M1, and so on.
> When a spec Open Question blocks you, stop and ask rather than guessing.

## 5. Definition of Done (every increment)

- [ ] Traces to specific spec sections (cited in the PR).
- [ ] Typechecks, lints, and all relevant tests/evals pass.
- [ ] Migrations included + reversible/backfilled where needed (doc 04).
- [ ] Outward actions idempotent + audit-logged; permissions/RLS enforced.
- [ ] Observability wired (run steps/tool calls/cost) for new runtime code.
- [ ] Proven end-to-end in staging (screenshot/log/trace of it working).
- [ ] Docs updated if behaviour changed; Open Questions resolved or re-logged.

## 6. Per-milestone build prompts

Give these in sequence; each assumes the Master Build Prompt is in effect.

### M0 — Foundations
> Implement the skeleton: repo structure (doc 02 §11), Next.js control-plane shell with the
> Mission Control layout stub (doc 07 §5) rendering live-ish placeholder status, Supabase
> project + full DB schema & migrations (doc 04) with the 35 agent seed rows (doc 03), auth +
> roles + RLS (doc 04 §12), Redis/BullMQ wiring, a worker process that runs a **no-op agent**
> end-to-end (enqueue → run → run_steps → realtime status → dashboard), MCP client scaffold +
> guard middleware (doc 08 §2), and cost/observability plumbing. DoD: a no-op run appears live
> on the dashboard; schema migrated; CI green.

### M1 — Single pipeline (Creative → carousel to Approval)
> Implement the Creative department agents needed for a carousel (creative_director,
> hook_writer, carousel_writer, cta_specialist, brand_voice_manager) with their contracts
> (doc 03), prompts (doc 09), memory recall/write (doc 05), and the pipeline graph stages
> Idea→…→Approval (doc 12) on LangGraph with checkpointing + HITL interrupt (doc 06). Build the
> Approvals queue + Asset Detail drawer (doc 07 §7). DoD: a carousel goes idea→draft→brand
> review→(visual QA stub)→approval in staging, resumable across a worker restart.

### M2 — Publish & measure (Instagram)
> Implement Design (Canva) stages, scheduling, and idempotent Instagram publishing
> (cross_platform_publisher, doc 08 §4.1, doc 12 §4.15) with exactly-once guarantees (doc 04
> §7.3), plus metric collection (instagram_analyst). DoD: an approved carousel publishes to a
> test IG account and metrics return and store; no double-post under retry.

### M3 — Learning loop
> Implement scoring, multi-dimensional clustering, pattern mining, the recommendation engine,
> and forecasting (doc 13), plus memory promotion/compaction (doc 05). Feed recommendations
> into ideation. DoD: real metrics produce confidence-gated recommendations that appear in the
> Analytics tab and influence the next ideation run; memory recall demonstrably used.

### M4 — Full org & daily automation
> Implement the remaining departments/agents and all formats (reel/story/image), the full
> 20-stage pipeline, agent communication protocol (doc 10), notifications (doc 03 §11.4), and
> the daily automation loop + cron + queues (doc 14). DoD: the daily loop runs unattended
> overnight in staging; operator approves by exception; weekly report delivered.

### M5 — Hardening
> Implement budgets/cost caps, full observability + alerting, resilience (circuit breakers,
> DLQ, graceful shutdown), accessibility (doc 07 §12), runbooks (doc 15 §9), and DR. DoD: NFRs
> (doc 01 §9) met; kill-switch verified; on-call-ready.

## 7. Guardrails for the agent (repeat as needed)

- Do not remove the human approval option or bypass HITL to "go faster."
- Do not publish, send, or delete without idempotency + audit.
- Do not store secrets/PII in DB rows, logs, or memory.
- Do not exceed per-run/day budgets; on cap, stop and report.
- Do not invent metrics/trends/citations — wire the tool or lower confidence and say so.
- Prefer editing the spec (PR) over silently diverging from it.

## 8. Handoff

Once M0–M5 are complete and their DoDs met, COS is a running content operating system that
detects trends, ideates, writes, designs, reviews, schedules, publishes, measures, and
learns — supervised by exception through a mission-control dashboard, and improving itself as
memory and analytics compound.

*End of document 16 — and of the COS specification package.*
