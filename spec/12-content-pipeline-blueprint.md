# 12 — Content Pipeline Blueprint

**Document:** 12 of 16 · **Status:** Baseline · **Owner:** Content + Agent Engineering

---

## 1. Purpose

Every piece of content flows through one fixed, observable pipeline. This document specifies
each of the 20 stages: who owns it, inputs, actions, outputs, pass/fail criteria, tools,
memory/KB use, and failure/degradation. It is the operational spine that the workflow engine
(doc 06) executes and the dashboard (doc 07) visualises.

## 2. The pipeline

```
Trend Detection → Research → Idea Generation → Hook Creation → Outline → Draft →
Brand Review → Grammar → SEO → Instagram Optimisation → Design → Thumbnail →
Approval → Scheduling → Publishing → Analytics → Learning → Memory Update
```

(18 named transformation stages; "Approval" and "Publishing" carry the HITL and idempotency
guarantees. The `pipeline_stage` enum in doc 04 §3 lists all stages; each maps to a
`pipeline_stage_runs` row.)

## 3. Stage contract (shape)

Each stage below is specified as: **Owner · Input · Action · Output · Pass criteria · Tools ·
Memory/KB · On fail.** Every stage writes a `pipeline_stage_runs` row (doc 04 §6.4) and emits
run steps + realtime status (doc 06 §11).

## 4. Stages

### 4.1 Trend Detection
- **Owner:** `trend_researcher` (Strategy).
- **Input:** source config, niche keywords, audience interests.
- **Action:** scan Reddit/YouTube/web; score trends; store with evidence.
- **Output:** scored `trends` rows; reactive-opportunity flags.
- **Pass:** ≥1 relevant trend above threshold OR evergreen fallback selected.
- **Tools:** `reddit.*`, `youtube.*`, `firecrawl.*`, `exa.search`.
- **Memory/KB:** recall past winning trends; KB *Instagram Growth*.
- **On fail:** use cached trends + evergreen themes; flag staleness.

### 4.2 Research
- **Owner:** `market_intelligence` + `competitor_analyst`.
- **Input:** selected trend/theme.
- **Action:** gather/verify facts; competitor angle scan; identify gaps.
- **Output:** `verified_facts` + competitor context.
- **Pass:** core claims verifiable with citations.
- **Tools:** `exa.search`, `firecrawl.*`, `perplexity.ask`, `kb.search`.
- **Memory/KB:** *Trading Books / SMC / Market Structure / Prop Firms*.
- **On fail:** mark unverified claims "do not publish"; narrow the angle.

### 4.3 Idea Generation
- **Owner:** `cso` → `creative_director`.
- **Input:** strategy brief, trends, research, recommendations (doc 13), personas.
- **Action:** generate + score ideas; pick format per idea.
- **Output:** `content_ideas` (prioritised), each with format + rationale.
- **Pass:** idea passes relevance + brand-fit + novelty threshold.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Memory/KB:** winners; *Storytelling*, *Copywriting*, personas.
- **On fail:** fall back to recommendation-driven or evergreen ideas.

### 4.4 Hook Creation
- **Owner:** `hook_writer`.
- **Input:** idea, format, persona, brand voice.
- **Action:** generate/score 5–10 hooks; choose best.
- **Output:** `assets.hook` + alternatives + rationale + confidence.
- **Pass:** chosen hook scores above threshold vs recalled winners.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Memory/KB:** *Hook Library*, *Psychology*, winning hooks.
- **On fail:** escalate to Creative Director; use safe proven pattern.

### 4.5 Outline
- **Owner:** format writer (carousel/reel/story).
- **Input:** idea + hook.
- **Action:** structure the piece (slides/beats/frames) for retention + payoff.
- **Output:** outline in `assets.body` (structure only).
- **Pass:** clear arc hook→value→proof→CTA; within format constraints.
- **Tools:** `openrouter.generate`, `kb.search`.
- **Memory/KB:** *Storytelling*, winning structures.
- **On fail:** revise; cap revisions (doc 06 §7.1).

### 4.6 Draft
- **Owner:** format writer.
- **Input:** outline.
- **Action:** write full copy (slide text / script / frames), caption draft.
- **Output:** full `assets.body` + `caption` draft + `confidence`.
- **Pass:** complete, coherent, on-format, within length limits.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Memory/KB:** winners, *Copywriting*.
- **On fail:** revise (bounded) → else HITL.

### 4.7 Brand Review
- **Owner:** `brand_voice_manager`.
- **Input:** draft.
- **Action:** check + edit to brand voice; **compliance filter** (doc 09 §9) for trading claims.
- **Output:** pass/fail + edited copy + violations; sets `brand_checked`, `compliance_flags`.
- **Pass:** on-voice AND no compliance violations (fail-closed on uncertainty).
- **Tools:** `openrouter.generate`, `kb.search` (Brand Guidelines).
- **Memory/KB:** *Brand Guidelines*, operator corrections.
- **On fail:** loop to Draft with fixes; repeated fail → HITL.

### 4.8 Grammar
- **Owner:** `brand_voice_manager` (or a lightweight grammar step).
- **Input:** brand-approved copy.
- **Action:** grammar/spelling/clarity pass (low temperature).
- **Output:** clean copy.
- **Pass:** no errors; meaning preserved.
- **Tools:** `openrouter.generate` (cheap).
- **On fail:** auto-fix; flag ambiguous rewrites.

### 4.9 SEO / Discoverability
- **Owner:** format writer / a discoverability helper.
- **Input:** clean copy.
- **Action:** optimise caption keywords, hashtags, alt-text; searchable phrasing.
- **Output:** `hashtags`, optimised caption, alt-text.
- **Pass:** relevant, non-spammy tags; keyword coverage.
- **Tools:** `openrouter.generate`, `kb.search` (Instagram Growth).
- **On fail:** default safe hashtag set.

### 4.10 Instagram Optimisation
- **Owner:** `creative_director` / Publishing input.
- **Input:** copy + format.
- **Action:** platform-specific tuning (slide count, hook timing for reels, cover text,
  first-comment strategy).
- **Output:** IG-optimised asset spec.
- **Pass:** matches current IG best-practice heuristics.
- **Tools:** `kb.search` (Instagram Growth), `memory.recall`.
- **On fail:** apply defaults; flag.

### 4.11 Design
- **Owner:** `design_lead` → `canva_designer` + `layout_designer`.
- **Input:** approved copy + design intent + brand system.
- **Action:** produce designs in Canva; enforce palette/type/layout.
- **Output:** `assets.design` (design id + exports).
- **Pass:** renders correctly; on-brand.
- **Tools:** `canva.*`, `drive.upload`, `kb.search` (Color/Typography).
- **On fail:** simpler template; escalate to Design Lead.

### 4.12 Thumbnail / Cover
- **Owner:** `thumbnail_creator`.
- **Input:** hook + design.
- **Action:** produce high-CTR cover(s); legibility at small size.
- **Output:** thumbnail variant(s).
- **Pass:** legible, on-brand, aligned to hook.
- **Tools:** `canva.*`.
- **On fail:** default cover template.

### 4.12b Visual QA (gate before approval)
- **Owner:** `visual_qa`.
- **Input:** near-final design + thumbnail.
- **Action:** check palette/type/margins/legibility/spelling-in-image/aspect.
- **Output:** pass/fail + annotated issues.
- **Pass:** no blocking visual defects (fail-closed).
- **On fail:** loop to Design (bounded) → else HITL.

### 4.13 Approval (HITL gate)
- **Owner:** Operator (human), orchestrated by Approval service.
- **Input:** full asset + all stage results + confidence + proposed schedule.
- **Action:** if `confidence ≥ threshold` AND auto-approve enabled for type → auto-pass;
  else **interrupt** and request human decision (doc 06 §6).
- **Output:** `approvals` decision (approved/changes_requested/rejected).
- **Pass:** approved.
- **On fail:** changes_requested → Draft (with operator note → memory); rejected → archive.

### 4.14 Scheduling
- **Owner:** `scheduler`.
- **Input:** approved asset + best-time model + calendar.
- **Action:** assign optimal `scheduled_at`; avoid collisions; record rationale.
- **Output:** `schedules` row.
- **Pass:** valid slot within cadence, no collision.
- **Tools:** `analytics.read`, `db.write_schedule`.
- **On fail:** safe historical slot; escalate conflicts.

### 4.15 Publishing
- **Owner:** `cross_platform_publisher`.
- **Input:** scheduled asset at fire time.
- **Action:** publish via adapter **idempotently**; record external id/permalink.
- **Output:** `publications` row (exactly-once).
- **Pass:** platform confirms; no duplicate.
- **Tools:** `instagram.publish` / adapters (idempotency key required).
- **On fail:** mark failed, hold, notify; never retry without idempotency key; degrade to
  manual-assist if API can't publish the media type.

### 4.16 Analytics
- **Owner:** `instagram_analyst` → `engagement_analyst` → `content_scorer`.
- **Input:** published asset ids.
- **Action:** collect metrics over windows; analyse engagement; score.
- **Output:** `metrics`, `scores`, engagement insights.
- **Pass:** metrics collected for defined windows (backfill if late).
- **Tools:** `instagram.insights`, `instagram.comments`.
- **On fail:** backfill later; flag gaps.

### 4.17 Learning
- **Owner:** `recommendation_engine` + `analytics_lead`.
- **Input:** scores + clusters.
- **Action:** mine winning patterns; produce recommendations; feed ideation.
- **Output:** `recommendations`, cluster updates (doc 13).
- **Pass:** recommendations meet confidence/sample thresholds (else withheld).
- **On fail:** withhold low-confidence; flag.

### 4.18 Memory Update
- **Owner:** every participating agent + `memory_manager`.
- **Input:** the full asset history + outcome.
- **Action:** write episodes (winners/failures/reactions); promote patterns to semantic
  memory (doc 05).
- **Output:** updated memory; compaction as needed.
- **Pass:** episodes written + embedded.
- **On fail:** queue embedding backfill; never block the pipeline on memory.

## 5. Cross-cutting pipeline rules

- **Confidence propagation:** each stage updates `assets.confidence`; low confidence biases
  toward HITL at Approval.
- **Revision loops:** quality gates (Brand/Grammar/SEO/IG/Visual QA) loop back with notes,
  bounded (doc 06 §7.1).
- **Idempotency:** Publishing (and any outward action) is exactly-once (doc 04 §7.3).
- **Observability:** every stage → `pipeline_stage_runs` + run steps + realtime status; the
  Asset Detail/Approval drawer (doc 07 §7.1) shows all stage results.
- **Cost:** cheap models on mechanical stages; frontier on judgment stages (doc 09 §7).

## 6. Format-specific variations

- **Reel:** Outline=beat sheet; Draft=script+on-screen text+VO; Design=Motion Graphics Plan
  (doc 03 §8.6) instead of Canva slides; Thumbnail=cover frame.
- **Carousel:** Outline/Draft=slides; Design=Canva multi-page; Thumbnail=slide 1 cover.
- **Story:** lighter pipeline (fewer design stages); fast-track; often auto-approve-eligible.
- **Image/Caption:** single-asset design; standard gates.

## 7. Pipeline SLAs

| Path | Target cycle time |
|------|-------------------|
| Reactive (trending) | trend → published < 4h |
| Evergreen | idea → published < 24h |
| Story | < 1h |

## 8. Metrics for the pipeline itself

Stage pass-rates, revision counts, HITL rate by type, cycle time per stage, cost per asset,
first-submission approval rate — surfaced in Operations/Analytics (docs 07/13).

## 9. Open questions

- OQ-01 Separate Grammar as its own stage vs fold into Brand Review — kept separate for
  observability; may merge for cost.
- OQ-02 Which formats are auto-approve-eligible at launch (ties to doc 01 OQ-03)?
- OQ-03 Visual QA as blocking gate for all types vs sampling for low-risk types.

*End of document 12.*
