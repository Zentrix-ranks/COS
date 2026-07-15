# 03 — Agent Architecture Document

**Document:** 03 of 16 · **Status:** Baseline · **Owner:** Agent Engineering

---

## 1. Purpose

COS is modelled as a company. This document defines its **org chart**, the **uniform
agent contract** every agent implements, and the **per-agent contracts** for all ~35
agents across seven departments. Workflows that wire these agents together are in doc 06;
their prompts are in doc 09; how they talk is in doc 10; the tools they hold are in doc 08.

## 2. The organisation

```
CEO Agent
│
├── Chief Strategy Officer (CSO)
│     ├── Trend Researcher
│     ├── Competitor Analyst
│     ├── Audience Researcher
│     └── Market Intelligence
│
├── Creative Director
│     ├── Hook Writer
│     ├── Carousel Writer
│     ├── Reel Writer
│     ├── Story Writer
│     ├── CTA Specialist
│     └── Brand Voice Manager
│
├── Design Department (Design Lead)
│     ├── Canva Designer
│     ├── Thumbnail Creator
│     ├── Layout Designer
│     ├── Visual QA
│     └── Motion Graphics Planner
│
├── Publishing Department (Publishing Lead)
│     ├── Scheduler
│     ├── Cross-platform Publisher
│     ├── Calendar Manager
│     └── Automation Manager
│
├── Analytics Department (Analytics Lead)
│     ├── Instagram Analyst
│     ├── Engagement Analyst
│     ├── Content Scorer
│     ├── Recommendation Engine
│     └── Growth Predictor
│
└── Operations (Ops Lead)
      ├── Database Manager
      ├── Memory Manager
      ├── Notification Manager
      ├── Tool Manager
      └── System Health
```

**Counts:** 1 CEO + 6 department heads + 28 specialists = **35 agents.**

## 3. Agent taxonomy

| Tier | Role | Autonomy | Typical model tier |
|------|------|----------|--------------------|
| **Executive** | CEO | Sets goals, allocates work, arbitrates, escalates to human | High (frontier) |
| **Manager** | Department heads (CSO, Creative Director, …) | Plan department work, review specialists, report up | High/Mid |
| **Specialist** | Workers | Do one job well, call tools, produce artifacts | Mid, cheap where possible |

Model tiering is defined per agent below and finalised in doc 09.

## 4. The uniform agent contract

Every agent MUST define these 11 fields. This is the schema stored in the `agents` table
(doc 04) and enforced by the executor (doc 02 §3.2).

1. **Goal** — the single outcome the agent exists to produce.
2. **Responsibilities** — the concrete duties it performs.
3. **Tools** — the exact MCP tools it may call (permission-gated, doc 08).
4. **Inputs** — the message/data it consumes (typed; doc 10 envelope).
5. **Outputs** — the artifacts/messages it emits (typed).
6. **Memory** — what it reads/writes in memory (doc 05 namespaces).
7. **Permissions** — actions and tool scopes it is authorised for.
8. **Communication channels** — who it receives from and reports to (doc 10 routing).
9. **Retry logic** — attempts, backoff, and what counts as retryable.
10. **Failure handling** — what happens on exhausted retries (fallback/escalate/park).
11. **Evaluation metrics** — how we measure whether it's doing its job well.

### 4.1 Contract JSON shape (stored + validated)

```jsonc
{
  "id": "hook_writer",
  "name": "Hook Writer",
  "tier": "specialist",
  "department": "creative",
  "reports_to": "creative_director",
  "goal": "Produce scroll-stopping opening hooks for a given idea and format.",
  "responsibilities": ["generate 5-10 hook candidates", "score & rank", "cite memory of past winners"],
  "tools": ["openrouter.generate", "memory.recall", "kb.search"],
  "inputs": ["idea", "format", "audience_persona", "brand_voice"],
  "outputs": ["hook_candidates[]", "chosen_hook", "rationale"],
  "memory": { "read": ["hooks", "winners", "audience_reactions"], "write": ["episodes", "hooks"] },
  "permissions": { "tools": ["openrouter.generate", "memory.recall", "kb.search"], "actions": ["propose"] },
  "channels": { "in": ["creative_director"], "out": ["creative_director", "carousel_writer", "reel_writer"] },
  "retry": { "max_attempts": 3, "backoff": "exp:2s", "retryable": ["tool_timeout", "rate_limit", "5xx"] },
  "failure": { "on_exhaust": "escalate", "to": "creative_director", "park_state": true },
  "model": { "tier": "mid", "route": "openrouter/anthropic/claude-*" },
  "eval": { "primary": "hook_ctr_lift", "secondary": ["approval_pass_rate", "diversity_score"] }
}
```

### 4.2 Executor lifecycle (applies to every agent)

```
receive message ─► validate envelope (doc 10)
  ─► recall relevant memory (doc 05)  ── skip if agent.memory.read empty
  ─► assemble prompt (system+role+task, doc 09) with recalled context + KB citations
  ─► loop: model call ⇄ permitted tool calls  (guarded by perms/rate/budget, doc 02 §6.3)
  ─► produce typed output; self-check against acceptance criteria
  ─► write episode + any semantic memory (doc 05)
  ─► emit output message to channels.out (doc 10)
  ─► on error: retry policy ─► on exhaust: failure handling
```

### 4.3 Global guardrails (all agents)

- **Step budget:** max reasoning/tool iterations per task (default 12) — prevents loops.
- **Time budget:** wall-clock cap per task (default 120s specialist, 600s manager).
- **Cost budget:** per-task token/$ cap; hard stop + escalate on breach.
- **No fabrication:** metrics, trends, and competitor facts MUST come from tools/DB.
- **Idempotency:** any outward action carries an idempotency key.
- **Transparency:** every run records inputs, tool calls, a reasoning summary, outputs,
  tokens, and cost to the run trace (doc 02 §8.2).

---

## 5. Executive

### 5.1 CEO Agent (`ceo`)

- **Goal:** Run the daily content operation to hit Zentrix's growth goals, allocating
  work across departments and escalating to the human only by exception.
- **Responsibilities:** interpret objectives & calendar; kick off the daily loop; assign
  goals to department heads; arbitrate priorities and conflicts; enforce budgets; decide
  when human approval is required; summarise the day for the operator.
- **Tools:** `orchestrator.dispatch`, `memory.recall`, `kb.search`, `analytics.read`,
  `notify.operator`.
- **Inputs:** objectives, content calendar, prior-day results, budgets, operator directives.
- **Outputs:** department goals/briefs, prioritised task list, daily summary, escalations.
- **Memory:** reads strategy/results/decisions; writes decisions & daily summaries.
- **Permissions:** may dispatch to any department head; may pause the operation; may set
  auto-approve policy within operator-defined bounds; may NOT publish directly.
- **Channels:** in ← operator, automation cron, department heads (reports); out → all
  department heads, operator (summaries/escalations).
- **Retry:** 2 attempts on planning tool failures; planning is deterministic-ish so most
  failures escalate rather than blindly retry.
- **Failure handling:** on repeated failure, pause the operation, notify operator with
  diagnosis, keep runs parked (resumable).
- **Evaluation metrics:** daily goal completion %, human-minutes per published asset,
  escalation precision (were escalations warranted?), budget adherence.
- **Model:** high tier (frontier).

---

## 6. Strategy department

### 6.1 Chief Strategy Officer (`cso`) — manager

- **Goal:** Turn the outside world (trends, competitors, audience) into a prioritised,
  evidence-backed content strategy for the day/week.
- **Responsibilities:** direct the four strategy specialists; synthesise their outputs
  into a strategy brief; maintain audience personas; feed prioritised themes to Creative.
- **Tools:** `orchestrator.dispatch`, `memory.recall`, `kb.search`, `analytics.read`.
- **Inputs:** CEO goals, specialist findings, analytics recommendations (doc 13).
- **Outputs:** strategy brief (themes, angles, priorities, evidence), updated personas.
- **Memory:** reads trends/competitors/personas/winners; writes strategy briefs & persona updates.
- **Permissions:** dispatch to strategy specialists; write personas; no publishing.
- **Channels:** in ← CEO, strategy specialists; out → CEO, Creative Director.
- **Retry:** 3; backoff exp 2s.
- **Failure handling:** escalate to CEO; deliver partial brief flagged low-confidence.
- **Evaluation:** downstream idea→publish conversion, recommendation adoption, brief freshness.
- **Model:** high/mid.

### 6.2 Trend Researcher (`trend_researcher`)

- **Goal:** Detect emerging, relevant trends before they peak.
- **Responsibilities:** scan Reddit, YouTube, web (Firecrawl/Exa); score trend relevance
  & momentum; store with evidence; flag reactive opportunities.
- **Tools:** `reddit.search`, `youtube.search`, `firecrawl.crawl`, `exa.search`,
  `memory.recall`, `db.write_trend`.
- **Inputs:** source config, audience interests, niche keywords (SMC, prop firms, forex…).
- **Outputs:** scored trend records with sources; reactive-opportunity flags.
- **Memory:** reads past trends/winners; writes new trends + episodes.
- **Permissions:** read external research tools; write `trends` table; no publishing.
- **Channels:** in ← CSO; out → CSO, Audience Researcher, Creative (via CSO).
- **Retry:** 3, exp 2s; retryable on tool timeout/rate-limit/5xx.
- **Failure handling:** degrade to cached/last-known trends; flag staleness; escalate to CSO.
- **Evaluation:** trend→winning-content hit rate, lead time before peak, source diversity.
- **Model:** mid.

### 6.3 Competitor Analyst (`competitor_analyst`)

- **Goal:** Track competitor output and infer what's working for them.
- **Responsibilities:** monitor competitor accounts/cadence/formats; estimate performance
  signals; maintain the competitor database (doc 11); surface gaps & threats.
- **Tools:** `firecrawl.crawl`, `exa.search`, `instagram.public_read` (where permitted),
  `db.write_competitor`, `memory.recall`.
- **Inputs:** competitor list, formats to watch, our recent performance.
- **Outputs:** competitor updates, gap analysis, "steal-worthy" patterns (ethically, as
  inspiration not copying).
- **Memory:** reads competitor DB; writes competitor updates + episodes.
- **Permissions:** read-only external; write competitor tables; no publishing.
- **Channels:** in ← CSO; out → CSO, Creative (via CSO).
- **Retry:** 3, exp 2s.
- **Failure handling:** partial update flagged; escalate to CSO.
- **Evaluation:** gap-to-idea conversion, freshness, false-positive rate on "working" signals.
- **Model:** mid.

### 6.4 Audience Researcher (`audience_researcher`)

- **Goal:** Keep an accurate, evolving model of the audience.
- **Responsibilities:** update audience personas from engagement + research; identify
  interests, pains, language; maintain persona records (doc 11).
- **Tools:** `analytics.read`, `reddit.search`, `exa.search`, `db.write_persona`, `memory.recall`.
- **Inputs:** engagement data, comments/DMs signals, research.
- **Outputs:** updated personas, interest shifts, language/tone cues.
- **Memory:** reads personas/reactions; writes persona updates + episodes.
- **Permissions:** read analytics; write personas; no publishing.
- **Channels:** in ← CSO, Analytics (reactions); out → CSO, Brand Voice Manager.
- **Retry:** 3.
- **Failure handling:** keep prior personas; flag as stale; escalate.
- **Evaluation:** persona-predicted vs actual engagement, freshness.
- **Model:** mid.

### 6.5 Market Intelligence (`market_intelligence`)

- **Goal:** Supply accurate domain facts (markets, SMC, prop-firm rules) so content is correct.
- **Responsibilities:** fetch/verify market-structure facts, prop-firm rule changes, forex
  context; feed factual grounding to Creative; flag risky claims for compliance.
- **Tools:** `exa.search`, `firecrawl.crawl`, `kb.search`, `db.write_fact`, `memory.recall`.
- **Inputs:** topics in the pipeline, claims to verify.
- **Outputs:** verified facts with citations; risk flags for compliance.
- **Memory:** reads KB/facts; writes verified facts + episodes.
- **Permissions:** read external + KB; write facts; no publishing.
- **Channels:** in ← CSO, Creative (fact requests); out → CSO, Creative, Brand Review.
- **Retry:** 3.
- **Failure handling:** mark claim "unverified — do not publish"; escalate.
- **Evaluation:** factual-accuracy rate (post-hoc), claims-blocked-correctly.
- **Model:** mid/high (accuracy-sensitive).

---

## 7. Creative department

### 7.1 Creative Director (`creative_director`) — manager

- **Goal:** Convert strategy into a slate of high-quality, on-brand content drafts.
- **Responsibilities:** turn the strategy brief into concrete asset briefs; assign to
  hook/format writers; review drafts; enforce brand voice; decide format per idea; hand
  approved-internally drafts to Design.
- **Tools:** `orchestrator.dispatch`, `memory.recall`, `kb.search`, `analytics.read`.
- **Inputs:** strategy brief, personas, brand voice, format performance data.
- **Outputs:** asset briefs, reviewed drafts, format decisions.
- **Memory:** reads winners/brand/hooks; writes briefs, review notes.
- **Permissions:** dispatch to creative specialists; request Design; no publishing.
- **Channels:** in ← CSO, CEO; out → creative specialists, Design Lead.
- **Retry:** 3.
- **Failure handling:** escalate to CEO; ship best available draft flagged for HITL.
- **Evaluation:** approval pass-rate, draft rework rate, format-fit accuracy.
- **Model:** high/mid.

### 7.2 Hook Writer (`hook_writer`)

- **Goal:** Produce scroll-stopping opening hooks per idea/format.
- **Responsibilities:** generate 5–10 candidates; score/rank against past winners; supply
  chosen hook + alternatives + rationale.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Inputs:** idea, format, persona, brand voice.
- **Outputs:** ranked hook candidates, chosen hook, rationale.
- **Memory:** reads hooks/winners/reactions; writes hooks + episodes.
- **Permissions:** generate + recall + KB; propose only.
- **Channels:** in ← Creative Director; out → Creative Director, format writers.
- **Retry:** 3.
- **Failure handling:** return best partial set; escalate to Creative Director.
- **Evaluation:** hook CTR lift, approval pass-rate, diversity.
- **Model:** mid.

### 7.3 Carousel Writer (`carousel_writer`)

- **Goal:** Write high-retention carousel copy (slide-by-slide).
- **Responsibilities:** structure slides (hook→value→proof→CTA); write concise per-slide
  copy; ensure narrative arc & save-worthiness; provide design notes for layout.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Inputs:** idea, chosen hook, persona, brand voice, slide-count target.
- **Outputs:** slide array (text + design intent), caption, hashtags, CTA slot.
- **Memory:** reads winning carousels; writes drafts + episodes.
- **Permissions:** generate + recall + KB; propose only.
- **Channels:** in ← Creative Director, Hook Writer; out → Creative Director, Design, CTA Specialist.
- **Retry:** 3.
- **Failure handling:** partial draft; escalate.
- **Evaluation:** saves/shares lift, completion rate proxy, approval pass-rate.
- **Model:** mid.

### 7.4 Reel Writer (`reel_writer`)

- **Goal:** Write reel scripts (hook, beats, on-screen text, voiceover, CTA).
- **Responsibilities:** craft ≤ 3s hook; structure beats for retention; specify on-screen
  text & b-roll intent; hand motion intent to Motion Graphics Planner.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Inputs:** idea, hook, persona, brand voice, duration target.
- **Outputs:** script (timed beats), on-screen text, VO, shotlist/b-roll notes, caption.
- **Memory:** reads winning reels; writes drafts + episodes.
- **Permissions:** generate + recall + KB; propose only.
- **Channels:** in ← Creative Director, Hook Writer; out → Creative Director, Motion Graphics Planner, CTA Specialist.
- **Retry:** 3.
- **Failure handling:** partial script; escalate.
- **Evaluation:** watch-time/retention lift, approval pass-rate.
- **Model:** mid.

### 7.5 Story Writer (`story_writer`)

- **Goal:** Write engaging story sequences (polls, questions, quick value).
- **Responsibilities:** design multi-frame story arcs; add interactive stickers intent;
  drive DMs/replies and profile visits.
- **Tools:** `openrouter.generate`, `memory.recall`, `kb.search`.
- **Inputs:** idea/theme, persona, brand voice.
- **Outputs:** story frames (copy + interaction intent), CTA.
- **Memory:** reads winning stories; writes drafts + episodes.
- **Permissions:** generate + recall + KB; propose only.
- **Channels:** in ← Creative Director; out → Creative Director, Design.
- **Retry:** 3.
- **Failure handling:** partial; escalate.
- **Evaluation:** replies/taps-forward, profile-visit lift.
- **Model:** cheap/mid.

### 7.6 CTA Specialist (`cta_specialist`)

- **Goal:** Attach the right call-to-action to every asset.
- **Responsibilities:** select/write CTAs from the CTA library (doc 11) matched to goal
  (save, share, DM, follow, link); A/B variants; ensure compliance-safe phrasing.
- **Tools:** `openrouter.generate`, `kb.search` (CTA library), `memory.recall`.
- **Inputs:** asset, goal, persona.
- **Outputs:** primary CTA + variant(s), placement note.
- **Memory:** reads CTA library + winners; writes CTA choices + episodes.
- **Permissions:** generate + recall + KB; propose only.
- **Channels:** in ← format writers, Creative Director; out → Creative Director.
- **Retry:** 3.
- **Failure handling:** default safe CTA; escalate.
- **Evaluation:** CTA-driven action lift (saves/DMs/link CTR).
- **Model:** cheap.

### 7.7 Brand Voice Manager (`brand_voice_manager`)

- **Goal:** Guarantee every asset sounds unmistakably like Zentrix.
- **Responsibilities:** own brand-voice rules; run the brand-review pipeline stage; rewrite
  off-voice copy; learn from operator corrections.
- **Tools:** `openrouter.generate`, `kb.search` (brand guidelines), `memory.recall`, `db.write_brand_note`.
- **Inputs:** draft copy, brand guidelines, past corrections.
- **Outputs:** pass/fail + edited copy + notes; updated brand rules on repeated corrections.
- **Memory:** reads brand rules/corrections; writes corrections + episodes.
- **Permissions:** edit copy; update brand notes; no publishing.
- **Channels:** in ← Creative Director (all drafts); out → Creative Director, format writers.
- **Retry:** 2.
- **Failure handling:** flag for HITL; never auto-pass uncertain voice.
- **Evaluation:** operator override rate on voice, consistency score.
- **Model:** mid.

---

## 8. Design department

### 8.1 Design Lead (`design_lead`) — manager

- **Goal:** Turn approved copy into on-brand visual assets ready to publish.
- **Responsibilities:** assign design tasks; enforce design system (palette/type, doc 11);
  route through Visual QA; deliver final assets to Publishing.
- **Tools:** `orchestrator.dispatch`, `canva.*`, `memory.recall`, `kb.search`.
- **Inputs:** approved copy + design intent, brand design system.
- **Outputs:** final visual assets (links/exports), design QA record.
- **Memory:** reads design winners/system; writes design decisions.
- **Permissions:** dispatch design specialists; use Canva; no publishing.
- **Channels:** in ← Creative Director; out → design specialists, Publishing Lead.
- **Retry:** 3.
- **Failure handling:** deliver best asset + QA flags; escalate.
- **Evaluation:** visual-QA pass-rate, design rework rate, on-brand score.
- **Model:** mid.

### 8.2 Canva Designer (`canva_designer`)

- **Goal:** Generate/assemble designs in Canva from templates + copy.
- **Responsibilities:** pick brand template; inject copy/assets; export; version.
- **Tools:** `canva.create-design-from-brand-template`, `canva.perform-editing-operations`,
  `canva.export-design`, `drive.upload`, `memory.recall`.
- **Inputs:** copy/slides, template id, brand kit.
- **Outputs:** design id + exported files (PNG/PDF/MP4 where relevant).
- **Memory:** reads template/winner choices; writes design records + episodes.
- **Permissions:** Canva read/write scoped to Zentrix brand kit; write assets to storage.
- **Channels:** in ← Design Lead; out → Design Lead, Visual QA.
- **Retry:** 3 (Canva/network).
- **Failure handling:** fall back to a simpler template; escalate to Design Lead.
- **Evaluation:** first-pass QA acceptance, time-to-asset.
- **Model:** cheap/mid (mostly tool-driven).

### 8.3 Thumbnail Creator (`thumbnail_creator`)

- **Goal:** Produce high-CTR thumbnails/covers.
- **Responsibilities:** design cover frames; test legibility at small size; align to
  hook; provide 1–2 variants.
- **Tools:** `canva.*`, `memory.recall`, `kb.search`.
- **Inputs:** hook, asset, brand system.
- **Outputs:** thumbnail variants + rationale.
- **Memory:** reads thumbnail winners; writes choices + episodes.
- **Permissions:** Canva scoped; storage write.
- **Channels:** in ← Design Lead; out → Design Lead, Visual QA.
- **Retry:** 3.
- **Failure handling:** default cover template; escalate.
- **Evaluation:** thumbnail CTR lift.
- **Model:** cheap/mid.

### 8.4 Layout Designer (`layout_designer`)

- **Goal:** Ensure information hierarchy & readability across slides/frames.
- **Responsibilities:** grid/spacing/hierarchy; safe margins; consistency across a set.
- **Tools:** `canva.*`, `kb.search` (design system), `memory.recall`.
- **Inputs:** design draft, design system.
- **Outputs:** layout-corrected design.
- **Memory:** reads layout patterns; writes decisions.
- **Permissions:** Canva scoped.
- **Channels:** in ← Design Lead, Canva Designer; out → Visual QA.
- **Retry:** 3.
- **Failure handling:** flag layout issues for HITL.
- **Evaluation:** readability score, QA pass-rate.
- **Model:** cheap.

### 8.5 Visual QA (`visual_qa`)

- **Goal:** Block off-brand or broken visuals before approval.
- **Responsibilities:** check palette, typography, safe margins, legibility, spelling in
  images, aspect ratios; pass/fail with reasons.
- **Tools:** `canva.get-design-content`, `vision.inspect` (model vision), `kb.search`.
- **Inputs:** near-final design, design system.
- **Outputs:** pass/fail + annotated issues.
- **Memory:** reads QA rules/past failures; writes QA records.
- **Permissions:** read designs; no edits (returns to designers).
- **Channels:** in ← Design Lead/designers; out → Design Lead, Approval.
- **Retry:** 2.
- **Failure handling:** default to fail-closed (route to HITL) on uncertainty.
- **Evaluation:** escaped-defect rate (issues found post-publish), false-fail rate.
- **Model:** mid (vision-capable).

### 8.6 Motion Graphics Planner (`motion_graphics_planner`)

- **Goal:** Plan reel motion/edit so external rendering is turnkey.
- **Responsibilities:** produce an edit plan (cuts, captions timing, transitions, b-roll,
  music intent) from the reel script; NOT render (v1).
- **Tools:** `openrouter.generate`, `kb.search`, `memory.recall`.
- **Inputs:** reel script + shotlist.
- **Outputs:** structured edit plan/spec.
- **Memory:** reads motion patterns; writes plans + episodes.
- **Permissions:** generate + recall.
- **Channels:** in ← Reel Writer, Design Lead; out → Design Lead, Publishing (as asset brief).
- **Retry:** 2.
- **Failure handling:** deliver partial plan flagged.
- **Evaluation:** downstream reel performance, plan completeness.
- **Model:** mid.

---

## 9. Publishing department

### 9.1 Publishing Lead (`publishing_lead`) — manager

- **Goal:** Get the right asset to the right platform at the right time, reliably.
- **Responsibilities:** coordinate scheduling/publishing/calendar/automation specialists;
  enforce idempotency; own the publishing calendar.
- **Tools:** `orchestrator.dispatch`, `memory.recall`, `analytics.read`.
- **Inputs:** approved assets, optimal-time data, calendar.
- **Outputs:** scheduled + published assets, calendar state.
- **Memory:** reads posting-time winners; writes publishing decisions.
- **Permissions:** dispatch publishing specialists; approve schedule; publishing gated by HITL policy.
- **Channels:** in ← Design Lead, CEO; out → publishing specialists, Analytics.
- **Retry:** 3.
- **Failure handling:** hold + notify on platform failure; never double-post.
- **Evaluation:** on-time publish rate, zero double-posts, schedule adherence.
- **Model:** mid.

### 9.2 Scheduler (`scheduler`)

- **Goal:** Assign each approved asset an optimal publish time.
- **Responsibilities:** compute best slots from analytics; avoid collisions; respect
  cadence rules; write schedule rows.
- **Tools:** `analytics.read` (best times), `db.write_schedule`, `memory.recall`.
- **Inputs:** approved assets, best-time model, existing calendar.
- **Outputs:** scheduled_at per asset.
- **Memory:** reads best-time patterns; writes schedules.
- **Permissions:** write `schedules`; no direct publish.
- **Channels:** in ← Publishing Lead; out → Calendar Manager, Cross-platform Publisher.
- **Retry:** 3.
- **Failure handling:** default to safe historical slot; escalate on conflict.
- **Evaluation:** posted-at-optimal-time %, engagement vs predicted.
- **Model:** cheap.

### 9.3 Cross-platform Publisher (`cross_platform_publisher`)

- **Goal:** Publish/queue assets to each platform via adapters, idempotently.
- **Responsibilities:** call platform adapters (Instagram first); adapt asset per platform;
  record external ids; guarantee exactly-once.
- **Tools:** `instagram.publish`, `platform_adapters.*`, `db.write_publication`, `memory.recall`.
- **Inputs:** scheduled asset, platform targets.
- **Outputs:** publication records (external ids, status).
- **Memory:** reads platform quirks; writes publications + episodes.
- **Permissions:** publish scoped to configured accounts; idempotency-key required.
- **Channels:** in ← Scheduler/Publishing Lead; out → Analytics, Calendar Manager.
- **Retry:** 3 with idempotency (safe).
- **Failure handling:** mark failed, hold, notify; never retry without idempotency key.
- **Evaluation:** publish success rate, zero duplicates.
- **Model:** cheap (tool-driven).

### 9.4 Calendar Manager (`calendar_manager`)

- **Goal:** Maintain an accurate content calendar (draft/scheduled/published).
- **Responsibilities:** reconcile schedule vs publications; surface gaps/overlaps; keep the
  calendar UI source-of-truth in sync.
- **Tools:** `db.read/write_calendar`, `memory.recall`.
- **Inputs:** schedules, publications, cadence rules.
- **Outputs:** calendar state, gap/overlap alerts.
- **Memory:** reads cadence norms; writes calendar events.
- **Permissions:** write calendar; no publish.
- **Channels:** in ← Scheduler, Publisher; out → Publishing Lead, Notification Manager.
- **Retry:** 2.
- **Failure handling:** flag inconsistencies for HITL.
- **Evaluation:** calendar accuracy, gap frequency.
- **Model:** cheap.

### 9.5 Automation Manager (`automation_manager`)

- **Goal:** Own the recurring automations (daily loop triggers, refresh jobs).
- **Responsibilities:** manage cron/queue triggers for publishing-side automations; ensure
  jobs fire, retry, and alert; coordinate with Ops.
- **Tools:** `scheduler.cron`, `queue.enqueue`, `memory.recall`.
- **Inputs:** automation config, run outcomes.
- **Outputs:** scheduled jobs, health signals.
- **Memory:** reads automation history; writes job records.
- **Permissions:** manage publishing-scope jobs; no publish itself.
- **Channels:** in ← Publishing Lead, Ops; out → System Health, Notification Manager.
- **Retry:** 3.
- **Failure handling:** dead-letter + alert.
- **Evaluation:** job success rate, missed-trigger count.
- **Model:** cheap.

---

## 10. Analytics department

### 10.1 Analytics Lead (`analytics_lead`) — manager

- **Goal:** Convert raw platform metrics into prescriptive guidance.
- **Responsibilities:** direct analytics specialists; own the weekly report; ensure
  recommendations feed Strategy/Creative; guard data-quality thresholds.
- **Tools:** `orchestrator.dispatch`, `analytics.read`, `db.read`, `memory.recall`.
- **Inputs:** collected metrics, content metadata.
- **Outputs:** weekly report, prioritized recommendations, KPI dashboards data.
- **Memory:** reads analytics history; writes reports/recommendations.
- **Permissions:** read analytics; write reports/recommendations; no publish.
- **Channels:** in ← Publishing (post-publish), CEO; out → CSO, Creative Director, CEO, operator.
- **Retry:** 3.
- **Failure handling:** deliver partial report flagged low-confidence.
- **Evaluation:** recommendation adoption + realized lift, report timeliness.
- **Model:** high/mid.

### 10.2 Instagram Analyst (`instagram_analyst`)

- **Goal:** Collect and normalise Instagram metrics per asset.
- **Responsibilities:** pull insights (reach, impressions, saves, shares, watch time,
  profile visits, follows) via Graph API; normalise; store time-series.
- **Tools:** `instagram.insights`, `db.write_metrics`, `memory.recall`.
- **Inputs:** published asset ids, metric windows.
- **Outputs:** normalized metric rows/time-series.
- **Memory:** reads metric norms; writes metrics + episodes.
- **Permissions:** read IG insights scoped; write metrics.
- **Channels:** in ← Publishing, Analytics Lead; out → Engagement Analyst, Content Scorer.
- **Retry:** 3 (API).
- **Failure handling:** backfill later; flag gaps.
- **Evaluation:** collection completeness, freshness.
- **Model:** cheap.

### 10.3 Engagement Analyst (`engagement_analyst`)

- **Goal:** Explain *why* engagement happened.
- **Responsibilities:** analyse comments/saves/shares; detect sentiment & themes; feed
  audience signals back to Strategy.
- **Tools:** `instagram.comments`, `openrouter.generate` (analysis), `db.write`, `memory.recall`.
- **Inputs:** metrics + comments per asset.
- **Outputs:** engagement insights, sentiment, audience-signal updates.
- **Memory:** reads reactions history; writes insights + episodes.
- **Permissions:** read engagement data; write insights.
- **Channels:** in ← Instagram Analyst; out → Audience Researcher, Content Scorer.
- **Retry:** 3.
- **Failure handling:** partial insights flagged.
- **Evaluation:** signal usefulness (adopted by Strategy), sentiment accuracy.
- **Model:** mid.

### 10.4 Content Scorer (`content_scorer`)

- **Goal:** Assign each asset a normalized performance score.
- **Responsibilities:** compute composite score (weighted saves/shares/watch-time/reach vs
  baseline); tag winners/losers; store scores for clustering.
- **Tools:** `db.read/write_scores`, `memory.recall`.
- **Inputs:** normalized metrics + asset metadata.
- **Outputs:** scores + win/loss tags.
- **Memory:** reads scoring model; writes scores.
- **Permissions:** write scores; no publish.
- **Channels:** in ← Instagram/Engagement Analysts; out → Recommendation Engine, Growth Predictor.
- **Retry:** 2.
- **Failure handling:** flag insufficient-sample assets.
- **Evaluation:** score↔future-performance correlation.
- **Model:** cheap.

### 10.5 Recommendation Engine (`recommendation_engine`)

- **Goal:** Turn winning patterns into concrete next-content recommendations.
- **Responsibilities:** run clustering (topic/hook/CTA/length/design/time); mine winning
  patterns above confidence thresholds; emit ranked "make more of X" recommendations.
- **Tools:** `analytics.cluster`, `db.read/write_recommendations`, `memory.recall`.
- **Inputs:** scored assets + clusters (doc 13).
- **Outputs:** ranked recommendations with evidence + confidence.
- **Memory:** reads pattern history; writes recommendations + episodes.
- **Permissions:** write recommendations; no publish.
- **Channels:** in ← Content Scorer; out → CSO, Creative Director, CEO.
- **Retry:** 2.
- **Failure handling:** withhold low-confidence recs; flag.
- **Evaluation:** adopted-recommendation realized lift.
- **Model:** mid/high.

### 10.6 Growth Predictor (`growth_predictor`)

- **Goal:** Forecast reach/follower trajectory and flag risks/opportunities.
- **Responsibilities:** model growth trends; project impact of content mix; alert on
  anomalies (drops/spikes).
- **Tools:** `analytics.read`, `db.write_forecast`, `memory.recall`.
- **Inputs:** historical time-series, planned calendar.
- **Outputs:** forecasts + confidence bands, anomaly alerts.
- **Memory:** reads history; writes forecasts.
- **Permissions:** write forecasts; no publish.
- **Channels:** in ← Content Scorer, Analytics Lead; out → CEO, CSO, Notification Manager.
- **Retry:** 2.
- **Failure handling:** widen confidence bands / abstain; flag.
- **Evaluation:** forecast error (MAPE), anomaly precision/recall.
- **Model:** mid.

---

## 11. Operations department

### 11.1 Ops Lead (`ops_lead`) — manager

- **Goal:** Keep COS healthy, observable, and within budget.
- **Responsibilities:** oversee DB/Memory/Notification/Tool/Health agents; own runbooks;
  manage budgets & alerts; coordinate incident response.
- **Tools:** `orchestrator.dispatch`, `db.admin_read`, `metrics.read`, `notify.operator`.
- **Inputs:** system metrics, health signals, budgets.
- **Outputs:** health status, incident actions, budget reports.
- **Memory:** reads ops history; writes incident/decision records.
- **Permissions:** read system internals; trigger safe remediations; escalate to human.
- **Channels:** in ← all ops agents, CEO; out → operator, all departments (advisories).
- **Retry:** 2.
- **Failure handling:** page operator on critical.
- **Evaluation:** uptime, MTTR, budget adherence.
- **Model:** mid.

### 11.2 Database Manager (`database_manager`)

- **Goal:** Keep data correct, migrated, and performant.
- **Responsibilities:** apply migrations (doc 04) via CI; monitor slow queries; manage
  retention/archival; ensure backups.
- **Tools:** `db.admin`, `metrics.read`.
- **Inputs:** migration set, query metrics.
- **Outputs:** migration status, health, retention actions.
- **Memory:** reads schema history; writes ops records.
- **Permissions:** DDL via controlled migration path only; no ad-hoc destructive writes.
- **Channels:** in ← Ops Lead; out → Ops Lead, System Health.
- **Retry:** 1 (DB ops are careful, not blindly retried).
- **Failure handling:** roll back migration; alert; never leave partial DDL.
- **Evaluation:** migration success, query p95, backup freshness.
- **Model:** cheap (tool/procedure driven).

### 11.3 Memory Manager (`memory_manager`)

- **Goal:** Keep memory useful: fresh, deduped, and retrievable.
- **Responsibilities:** manage embedding backfills; dedupe/compact episodes; summarise old
  memory into semantic notes; maintain vector index health (doc 05).
- **Tools:** `memory.admin`, `embeddings.batch`, `db.admin_read`.
- **Inputs:** memory tables, index stats.
- **Outputs:** compacted/summarized memory, index maintenance.
- **Memory:** operates on all namespaces (privileged).
- **Permissions:** memory admin; summarise (not delete source without policy).
- **Channels:** in ← Ops Lead; out → Ops Lead.
- **Retry:** 2.
- **Failure handling:** skip + alert; never corrupt memory.
- **Evaluation:** recall quality (hit rate), index latency, storage growth.
- **Model:** cheap/mid.

### 11.4 Notification Manager (`notification_manager`)

- **Goal:** Deliver the right notifications to the right channel without noise.
- **Responsibilities:** route notifications (in-app, Slack, Discord, email via Resend);
  batch/deduplicate; respect quiet hours & severity.
- **Tools:** `slack.send`, `discord.send`, `resend.send`, `db.write_notification`.
- **Inputs:** events from any agent (approvals, alerts, reports).
- **Outputs:** delivered notifications + in-app records.
- **Memory:** reads notification prefs; writes delivery log.
- **Permissions:** send to configured channels only; rate-limited.
- **Channels:** in ← all agents; out → operator channels.
- **Retry:** 3.
- **Failure handling:** fall back to in-app; escalate delivery failures.
- **Evaluation:** delivery success, noise complaints, time-to-notify on critical.
- **Model:** cheap.

### 11.5 Tool Manager (`tool_manager`)

- **Goal:** Keep external tools connected, authorised, and within limits.
- **Responsibilities:** health-check MCP tools; refresh/rotate credentials (via vault);
  monitor rate limits & quotas; open circuit breakers; expose tool status to the UI.
- **Tools:** `tools.healthcheck`, `secrets.status`, `metrics.read`.
- **Inputs:** tool configs, error rates.
- **Outputs:** tool status matrix, breaker states, alerts.
- **Memory:** reads tool history; writes status/incidents.
- **Permissions:** read secret *status* (not values); toggle breakers; no publish.
- **Channels:** in ← all agents (tool errors), Ops Lead; out → Ops Lead, System Health, UI.
- **Retry:** n/a (monitoring).
- **Failure handling:** breaker-open + degrade dependent stages + alert.
- **Evaluation:** tool uptime, mean-time-to-detect outages.
- **Model:** cheap.

### 11.6 System Health (`system_health`)

- **Goal:** Provide a single truthful view of system health.
- **Responsibilities:** aggregate queue depth, run success, tool status, budget burn,
  error rates; compute the "Instagram Health" and overall health indicators; drive alerts.
- **Tools:** `metrics.read`, `db.read`, `notify.operator`.
- **Inputs:** all subsystem metrics.
- **Outputs:** health rollups (green/amber/red), alerts, incident timelines.
- **Memory:** reads incident history; writes health snapshots.
- **Permissions:** read-only across system; alert.
- **Channels:** in ← all ops agents; out → operator, CEO.
- **Retry:** n/a.
- **Failure handling:** self-report degraded if inputs missing.
- **Evaluation:** alert precision/recall, dashboard accuracy.
- **Model:** cheap.

---

## 12. Cross-agent policies

### 12.1 Escalation ladder

```
specialist ─(exhaust retries / low confidence / policy)─► department head
department head ─(cross-dept conflict / budget / stakes)─► CEO
CEO ─(needs human judgment / brand risk / spend cap)─► Operator (HITL)
```

### 12.2 Confidence & HITL

Every produced artifact carries a `confidence` in [0,1]. Below the asset-type threshold,
the pipeline routes to a human approval gate regardless of auto-approve settings.

### 12.3 Permissions matrix (summary)

| Capability | Who may |
|-----------|---------|
| Publish externally | `cross_platform_publisher` only (idempotent, HITL-gated) |
| Send external notifications | `notification_manager` only |
| Write personas | `audience_researcher`, `cso` |
| Update brand rules | `brand_voice_manager` (with operator confirmation on major changes) |
| Apply DB migrations | `database_manager` via CI only |
| Toggle tool breakers | `tool_manager`, `ops_lead` |
| Pause the operation | `ceo`, `ops_lead`, operator |

Full tool-level permissions are in doc 08; DB-level RLS in doc 04.

### 12.4 Model routing summary

| Tier | Used by | Rationale |
|------|---------|-----------|
| High (frontier) | CEO, CSO, Creative Director, Analytics Lead, Recommendation Engine, Market Intelligence | Judgment/quality-critical |
| Mid | most writers/analysts | Balanced quality/cost |
| Cheap | tool-driven ops, scorers, schedulers, CTAs, stories | Mostly mechanical |

Exact models & fallbacks: doc 09 §model-routing.

## 13. Adding a new agent (procedure)

1. Author the 11-part contract JSON (§4.1) and add a row to `agents` (doc 04).
2. Define its prompts in doc 09.
3. Declare its tools & permissions in doc 08.
4. Wire it into the relevant graph in doc 06.
5. Add its channels to doc 10 routing.
6. Add evaluation metrics to the analytics/health dashboards.
7. Ship behind a feature flag; validate in staging; enable.

## 14. Open questions

- OQ-01 Do we split Reel Writer into short-form vs long-form at scale? (defer)
- OQ-02 Should Brand Voice Manager auto-update rules or always require operator confirm?
  (v1: confirm on major changes.)
- OQ-03 Growth Predictor modelling approach (heuristic vs learned) at launch — start heuristic.

*End of document 03.*
