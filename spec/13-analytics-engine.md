# 13 — Analytics Engine Specification

**Document:** 13 of 16 · **Status:** Baseline · **Owner:** Analytics Engineering

---

## 1. Purpose & principle

The analytics engine exists to be **prescriptive, not descriptive.** It does not merely count
likes; it discovers *why* content works and tells the rest of the company *what to make
next.* This document defines metric collection, normalization, scoring, clustering, pattern
mining, the recommendation engine, forecasting, and the weekly report.

## 2. Data flow

```
Last N Posts ─► Collect metrics ─► Normalize ─► Score ─►
Cluster by [topic · hook · CTA · length · design · posting time · format] ─►
Find winning patterns (confidence-gated) ─► Recommend future content ─► feed ideation
                                          └─► Forecast growth  └─► Weekly report
```

This mirrors the founding sketch: *Last 90 Posts → cluster by many dimensions → find winning
patterns → recommend future content.*

## 3. Metric collection & normalization

- **Source of record:** Instagram Graph API insights (doc 08 §4.1); PostHog secondary.
- **Collected per publication over windows** (24h/48h/7d/lifetime): reach, impressions,
  views, watch time, avg watch, saves, shares, comments, likes, profile visits, follows,
  link clicks, CTR (doc 04 §8.1).
- **Normalization:** raw counts → rates and z-scores relative to a rolling baseline (per
  format), so a small-reach post isn't unfairly penalized. Store both raw and normalized.
- **Backfill:** late/missing metrics are backfilled; gaps flagged, not guessed.

## 4. Scoring

`content_scorer` computes a composite score per asset (doc 04 §8.2):

```
composite = Σ wᵢ · normalize(metricᵢ)
default weights (tunable, per goal):
  saves 0.30, shares 0.25, watch_time/retention 0.20, reach 0.10,
  profile_visits 0.08, follows 0.05, comments 0.02
```

- Compare against a **baseline** (rolling median for that format/window) → percentile.
- **Label:** winner (top quartile) / neutral / loser (bottom quartile).
- **Min-sample gate:** assets below a reach/impression threshold are marked `sample_ok=false`
  and excluded from pattern mining (avoid learning from noise).
- Weights are configurable per objective (e.g., a "growth" week weights follows/reach higher).

## 5. Clustering (multi-dimensional)

For the last N posts (default 90), cluster along each dimension (doc 04 §8.3
`cluster_dimension`):

| Dimension | How clustered |
|-----------|---------------|
| **topic** | embedding of asset content → semantic clusters |
| **hook** | embedding of the hook + pattern tags → hook-style clusters |
| **CTA** | CTA kind/text → categorical + semantic |
| **length** | duration/slide-count buckets |
| **design** | design attributes (palette/layout/template) → categorical |
| **posting time** | day-of-week × hour buckets |
| **format** | reel/carousel/story/image |

- **Semantic dims** (topic/hook) use pgvector centroids; **categorical dims** use grouping.
- Each cluster stores `size`, `avg_score`, and a `confidence` reflecting sample size and
  within-cluster variance.

## 6. Pattern mining (winning patterns)

- A **winning pattern** = a cluster (or cross-dimension combination) whose `avg_score`
  significantly exceeds baseline with sufficient sample and low variance.
- **Cross-dimension mining:** find high-lift combinations, e.g., *(hook=contrarian) ×
  (format=carousel) × (time=evening)* → +34% saves. Guard against combinatorial overfitting
  with minimum support counts.
- **Confidence gate:** patterns below the configured confidence/support threshold are not
  promoted to recommendations (prevents "post at 3:07am because one post did well").
- **Significance:** use effect size + sample thresholds (and simple significance tests where
  applicable) rather than raw averages.

## 7. Recommendation engine

`recommendation_engine` turns patterns into concrete guidance (doc 04 §8.4):

- Output form: **"Make more of X because Y"** with evidence (cluster ids, sample size,
  measured lift) and a confidence.
- Recommendations are **actionable and specific**: format + hook style + CTA + length +
  timing, tied to a theme.
- Ranked by expected impact × confidence.
- **Lifecycle:** `proposed → accepted/rejected → implemented → measured`. When implemented,
  the engine later measures `realized_lift` (did following the rec actually help?) — closing
  the loop and calibrating future confidence.
- Recommendations feed **Idea Generation** (doc 12 §4.3) and the operator's Analytics tab
  (doc 07 §6.2), where they can be accepted/rejected.

### 7.1 Closing the loop (self-correction)

The engine tracks recommendation adoption vs realized lift. Recommendations that repeatedly
fail to produce lift are down-weighted; patterns that hold up are trusted more. This is how
COS gets measurably smarter over time (doc 01 H3).

## 8. Forecasting

`growth_predictor` (doc 04 §8.5):

- Forecast reach/followers over 7d/30d horizons with confidence bands.
- v1 method: heuristic/statistical (trend + seasonality from history + planned content mix);
  upgradeable to a learned model later.
- **Anomaly detection:** flag sudden drops/spikes (e.g., reach −40% WoW) → alert via
  Notification Manager.
- Forecasts are advisory; always shown with uncertainty (never false precision).

## 9. Weekly report

`analytics_lead` composes the weekly report (doc 04 §8.5, doc 09 §8.5):

- **Contents:** what worked / what didn't, top & bottom assets, KPI movement, 3 prescriptive
  next actions (from recommendations), and forecast + risks.
- **Grounding:** every claim tied to supplied metrics (no invented numbers — house rule).
- **Delivery:** rendered in-app (doc 07) and delivered via Slack/Discord/Email/Notion (doc
  03 §11.4). Stored in `weekly_reports`.

## 10. Instagram Health indicator

Feeds the dashboard "Instagram Health: Excellent" pill (doc 07):

```
IG health = f(reach trend, engagement-rate trend, follower growth, posting consistency,
              anomaly flags) → {Excellent, Good, Fair, Poor}
```

Computed by `growth_predictor`/`system_health`; shown on Mission Control.

## 11. Compute & jobs

| Job | Schedule | Action |
|-----|----------|--------|
| `collect_metrics` | hourly + post-publish windows | pull insights, store |
| `score_assets` | after collection | compute composite scores |
| `recluster` | daily | rebuild clusters over last N |
| `mine_patterns` | daily | winning-pattern detection |
| `generate_recommendations` | daily | rank + persist recs |
| `measure_recommendations` | continuous | fill realized_lift |
| `forecast` | daily | growth forecasts + anomalies |
| `weekly_report` | weekly | compose + deliver |

Jobs run on BullMQ (doc 14). Heavy analytics run off the request path.

## 12. Data quality guardrails

- Minimum sample thresholds everywhere (scoring, clustering, patterns).
- Exclude anomalous/boosted posts from baseline where detectable.
- Confidence surfaced on every derived artifact; low-confidence items are withheld or
  clearly labelled.
- All derived numbers trace back to `metrics` rows (auditable in Run Inspector, doc 07 §8).

## 13. Privacy

- Aggregate/normalized analysis; comment text used for sentiment/theme extraction under
  retention limits (doc 04 §16). No storage of identifiable personal data beyond platform-
  provided public content.

## 14. APIs (analytics surface)

`GET /api/analytics/overview`, `/metrics/:assetId`, `/clusters?dimension=`,
`/recommendations`, `POST /api/analytics/recommendations/:id/decision`,
`GET /api/reports/weekly/:id`, `GET /api/analytics/forecast` (doc 02 §7, doc 07 §15).

## 15. Open questions

- OQ-01 N for "last N posts" (90 default) — fixed vs adaptive to volume.
- OQ-02 Significance approach for small accounts (Bayesian shrinkage recommended).
- OQ-03 When to graduate forecasting from heuristic to learned model (post sufficient history).

*End of document 13.*
