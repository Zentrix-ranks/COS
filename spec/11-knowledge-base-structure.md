# 11 — Knowledge Base Structure

**Document:** 11 of 16 · **Status:** Baseline · **Owner:** Content + Agent Engineering

---

## 1. Purpose

The knowledge base (KB) is COS's curated reference library — the craft and domain knowledge
agents draw on to be *correct and on-brand*, distinct from earned memory (doc 05). This
document defines the KB categories, ingestion, chunking/embedding, retrieval, governance,
and how each category is used by agents.

## 2. KB vs memory (recap)

- **KB** = curated, relatively static reference (brand guidelines, trading concepts,
  copywriting craft). Authored/ingested deliberately.
- **Memory** = earned, dynamic experience (what worked, operator preferences).

Both are pgvector-searchable (`kb_chunks`, doc 04 §9.3) and retrieved together at generation
time, labelled by source (doc 05 §7).

## 3. Categories

| Category | Contents | Primary consumers |
|----------|----------|-------------------|
| **Brand Guidelines** | mission, positioning, do/don't, tone, banned phrases | Brand Voice Manager, all writers |
| **Psychology** | persuasion, cognitive biases, attention, retention | Hook/Reel/Carousel writers |
| **Trading Books** | distilled notes from core trading references | Market Intelligence, writers |
| **Market Structure** | how markets move, structure concepts | Market Intelligence, writers |
| **SMC Concepts** | Smart Money Concepts terminology & patterns | writers, Market Intelligence |
| **Forex** | pairs, sessions, fundamentals basics | writers |
| **Prop Firms** | firm rules, challenges, payout structures (kept current) | Market Intelligence, writers |
| **Instagram Growth** | format best-practices, algorithm heuristics | Creative, Publishing, Analytics |
| **Storytelling** | narrative structures, arcs, hooks-to-payoff | writers |
| **Copywriting** | frameworks (AIDA, PAS…), microcopy, CTAs | writers, CTA Specialist |
| **Color System** | brand palette, usage, contrast rules | Design dept |
| **Typography** | type scale, pairings, hierarchy rules | Design dept |
| **CTA Library** | proven CTAs by goal (save/share/DM/follow/link) | CTA Specialist |
| **Hook Library** | proven hook patterns by format | Hook Writer |
| **Past Posts** | archive of published assets + their copy | writers, Analytics |
| **Analytics History** | summarized historical performance context | Analytics, Strategy |
| **Competitor Database** | competitor profiles + observed patterns | Competitor Analyst |
| **Audience Personas** | detailed persona records | Strategy, writers |

> Note: **Past Posts**, **Analytics History**, **Competitor Database**, and **Audience
> Personas** overlap with operational tables (docs 04 §9). They are exposed to agents both
> as structured tables *and* as embedded KB chunks for semantic recall.

## 4. Storage & schema

Curated documents live in `kb_documents`; embedded chunks in `kb_chunks` (doc 04 §9.3).
`category` on `kb_documents` maps to §3. Structured KB (personas, competitors, CTA/hook
libraries) also lives in dedicated tables (doc 04 §9) and is mirrored into chunks by an
ingest job so it's retrievable semantically.

### 4.1 Special libraries as structured data

- **CTA Library:** rows of `{text, goal, format, notes, performance}` — queried by CTA
  Specialist directly and embedded for semantic match.
- **Hook Library:** rows of `{pattern, example, format, when_to_use, performance}` — same.
- **Color System / Typography:** the design system tokens (also consumed by the frontend
  design system, doc 07 §3) plus prose rules for agents (Visual QA references these).

## 5. Ingestion pipeline

```
source (Notion / Drive / upload / URL) ─► loader ─► normalize (markdown) ─►
chunk (semantic, ~500–800 tokens, overlap) ─► embed ─► upsert kb_chunks ─► index
```

- **Loaders:** Notion (`notion.search/fetch`), Drive, direct upload, URL (Firecrawl).
- **Normalization:** to clean markdown; strip boilerplate; preserve headings for citation.
- **Chunking:** heading-aware, ~500–800 tokens with ~10% overlap; store `ordinal` for
  citations.
- **Embedding:** configured model (doc 05 §10); content-hash cache; batched.
- **Reindex:** on document update, re-chunk/re-embed changed docs only.

## 6. Retrieval (RAG)

- Agents call `kb.search({query, category?, k})` → hybrid vector + trigram retrieval scoped
  by category where known (e.g., Brand Voice Manager searches `brand` + `copywriting`).
- Results are injected as the **[KNOWLEDGE]** block (doc 09 §5) with citations
  (`doc#ordinal`) so output is traceable and claims are grounded.
- **Hybrid** with memory: winners (memory) + craft (KB) merged; source-labelled; token-capped.

## 7. Governance & freshness

- **Ownership:** each category has an owner (person or agent) responsible for accuracy.
- **Freshness-sensitive categories** (Prop Firms rules, Analytics History, Competitor DB) are
  refreshed on schedule (doc 14) — stale entries flagged and down-ranked.
- **Compliance-sensitive** content (trading claims) is reviewed; the KB stores the *approved*
  framing and required disclaimers that the compliance filter (doc 09 §9) enforces.
- **Versioning:** KB documents are versioned; changes tracked; embeddings updated on change.
- **Provenance:** every chunk links to its source document for auditability.

## 8. Quality controls

- **De-duplication:** near-duplicate chunks merged to avoid recall pollution.
- **Contradiction checks:** conflicting facts across documents surfaced to the owner.
- **Coverage map:** track which categories are thin so we know where to invest.
- **Retrieval evals:** a labelled query set checks that the right chunks are retrieved for
  representative agent queries (regression-tested).

## 9. Security & rights

- Only license-appropriate content is ingested (e.g., *distilled notes* from trading books,
  not verbatim copyrighted text).
- No secrets/PII in the KB.
- Access is read-only for content agents; writes go through the ingest pipeline + owners.

## 10. Category usage detail (how agents apply the KB)

- **Brand Voice Manager** grounds every review in *Brand Guidelines* + *Copywriting*; learns
  operator corrections into memory (doc 05) that eventually update Brand Guidelines via owner.
- **Hook Writer** calibrates against *Hook Library* + *Psychology* + recalled winners.
- **Market Intelligence** verifies claims against *Trading Books / Market Structure / SMC /
  Prop Firms* and cites; flags anything it can't ground for compliance.
- **Design agents** enforce *Color System* + *Typography*; Visual QA checks against them.
- **Analytics/Strategy** contextualize current numbers with *Analytics History* and
  *Competitor Database*.

## 11. Ingest & maintenance jobs (ties to doc 14)

| Job | Schedule | Action |
|-----|----------|--------|
| `kb_ingest_new` | on upload/webhook | ingest new/updated docs |
| `kb_refresh_freshness` | daily/weekly | refresh prop-firm rules, competitor DB, analytics history |
| `kb_reembed` | on model change | re-embed corpus |
| `kb_quality` | weekly | dedupe, contradiction + coverage report |

## 12. Open questions

- OQ-01 Notion vs Drive vs in-repo markdown as the *authoring* source of record — support
  multiple loaders; recommend Notion for brand/knowledge, repo for design tokens.
- OQ-02 How much of "Past Posts" to embed vs keep structured-only (cost vs recall) — embed
  summaries + hooks, keep full copy structured.
- OQ-03 Chunk size/overlap defaults — tune with retrieval evals post-M3.

*End of document 11.*
