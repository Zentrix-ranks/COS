# 05 — Memory System Specification

**Document:** 05 of 16 · **Status:** Baseline · **Owner:** Agent Engineering

---

## 1. Purpose

Memory is what turns COS from a stateless prompt runner into a company with institutional
knowledge. This document defines the memory model, its storage (PostgreSQL + pgvector,
doc 04 §10), how agents write and recall it, retrieval strategy, decay/compaction, and the
governance around it. The product principle is absolute: **recall before generation.**

## 2. Memory types

| Type | Question it answers | Storage | Example |
|------|--------------------|---------|---------|
| **Episodic** | "What happened when I did this before?" | `memory_episodes` | "Reel #42 used a contrarian hook; saved 3.1×." |
| **Semantic** | "What do we know to be true?" | `memory_semantic` | brand rule: "never promise guaranteed returns." |
| **Preference** | "What does the operator/brand prefer?" | `memory_semantic` (kind=preference) | "Operator prefers hooks under 8 words." |
| **Rule** | "What must always/never happen?" | `memory_semantic` (kind=rule) | "Always add risk disclaimer to prop-firm posts." |
| **Working** | "What's in-flight right now?" | run `checkpoint` (doc 04 §5.3) | current pipeline state. |

The founding requirement — every agent remembers *previous tasks, successful content,
failed content, audience reactions, brand rules, writing style, preferred hooks, common
CTAs, content themes, recent trends, pending work* — maps onto these types via
**namespaces**.

## 3. Namespaces

Memory is partitioned by namespace so recall is scoped and cheap.

| Namespace | Type | Written by | Read by |
|-----------|------|-----------|---------|
| `tasks` | episodic | all agents | all |
| `winners` | episodic | Content Scorer, writers | writers, CSO, Creative Director |
| `failures` | episodic | writers, Visual QA | writers, Creative Director |
| `reactions` | episodic | Engagement Analyst | Audience Researcher, writers |
| `brand_rules` | rule | Brand Voice Manager | all creative |
| `writing_style` | semantic | Brand Voice Manager | writers |
| `preferred_hooks` | semantic | Hook Writer, Scorer | Hook Writer, writers |
| `cta_library` | semantic | CTA Specialist | CTA Specialist |
| `themes` | semantic | CSO | Creative |
| `trends` | episodic | Trend Researcher | Strategy, Creative |
| `pending_work` | working | orchestrator | CEO, department heads |

## 4. Data shapes

Episodic (see `memory_episodes`, doc 04):

```jsonc
{
  "agent_id": "hook_writer",
  "namespace": "winners",
  "asset_id": "…",
  "summary": "Contrarian hook 'Stop trading breakouts' on SMC reel; saves 3.1x baseline",
  "payload": { "hook": "...", "format": "reel", "score": 8.7, "cluster": "contrarian_hook" },
  "outcome": "success",
  "importance": 0.82,
  "embedding": "[…1536…]"
}
```

Semantic (see `memory_semantic`): a stable key→value fact with provenance to the episodes
that produced it.

## 5. Writing memory

Every agent's executor writes at least one episode per task (doc 03 §4.2). Rules:

1. **Summarise, don't dump.** `summary` is a compact natural-language description; large
   payloads go in `payload` jsonb, not the embedding text.
2. **Embed the summary** (+ key fields) using the configured embedding model; store in
   `embedding`.
3. **Set importance** from signal: outcome, score percentile, novelty. Importance drives
   retention and recall ranking.
4. **Promote to semantic** when a pattern repeats: the Memory Manager (doc 03 §11.3) or the
   writing agent condenses repeated episodes into a `memory_semantic` row with provenance
   in `source_episodes` and a confidence score.
5. **Rules require confirmation.** New `rule`/`brand_rules` entries that materially change
   behaviour require operator confirmation (doc 03 §12.3).

### 5.1 Write path (pseudo)

```
writeEpisode({agent, namespace, asset, summary, payload, outcome}):
  importance = scoreImportance(outcome, payload)
  embedding  = embed(summary + salientFields(payload))
  insert into memory_episodes (...)
  if patternRepeats(namespace, summary): upsertSemantic(...)
```

## 6. Recall (retrieval)

Before generating, an agent recalls relevant memory. Retrieval is **hybrid**: vector
similarity + structured filters + optional keyword (trigram) match.

### 6.1 Recall query

```sql
-- top-k similar winning hooks for this agent & format
select id, summary, payload, importance,
       1 - (embedding <=> :q) as similarity
from memory_episodes
where namespace = 'winners'
  and payload->>'format' = :format
  and outcome = 'success'
order by (0.7*(1 - (embedding <=> :q)) + 0.3*importance) desc
limit :k;
```

### 6.2 Hybrid retrieval strategy

1. **Filter** by namespace + structured predicates (format, agent, recency window).
2. **Vector rank** by cosine similarity to the task embedding.
3. **Blend** similarity with `importance` (and recency) using tunable weights.
4. **Keyword fallback/boost** via `pg_trgm` for exact-term matches (e.g., a specific
   ticker/term).
5. **Dedupe** near-identical memories; cap tokens injected into the prompt.

### 6.3 What gets injected

The executor injects a bounded "memory context" block into the prompt (doc 09):

```
[MEMORY]
Winning patterns (recall): <3-5 bullets>
Relevant failures to avoid: <1-3 bullets>
Brand rules (must follow): <rules>
Operator preferences: <preferences>
[/MEMORY]
```

Token budget per block is capped (default ~800 tokens) to protect context and cost.

## 7. Knowledge vs memory

- **Knowledge base** (doc 11, tables `kb_documents`/`kb_chunks`) is curated, relatively
  static reference material (brand guidelines, trading concepts, copywriting).
- **Memory** is earned, dynamic experience (what worked, what the operator said).

Both are retrieved via pgvector. Agents typically consult **both**: KB for grounding
facts/craft, memory for what has actually worked for Zentrix. Retrieval merges results and
labels their source so the prompt can weight them.

## 8. Decay, compaction & forgetting

Unbounded memory degrades recall quality and inflates cost. Policies (run by Memory
Manager, doc 03 §11.3):

- **Recency decay:** recall ranking includes a decay term so stale episodes fade unless
  high-importance.
- **Compaction:** clusters of similar low-importance episodes are summarised into one
  semantic note; sources archived (not hard-deleted) for provenance.
- **Importance floor:** episodes below an importance/age threshold are archived to cold
  storage and dropped from the hot vector index.
- **Never forget rules:** `rule`/`brand_rules` and operator preferences are exempt from
  decay; they persist until explicitly changed.

## 9. Consistency & provenance

- Semantic facts store `source_episodes` for auditability ("why does COS believe this?").
- Conflicting facts: the higher-confidence, more-recent, better-supported entry wins;
  conflicts above a threshold are surfaced to the operator via Notification Manager.
- Every recall used in a generation is logged on the `run_step` so decisions are explainable
  (doc 07 Run Inspector shows "memories used").

## 10. Embeddings

- Model configurable; default `text-embedding-3-small` (1536-dim) for cost; upgradeable.
- Embeddings computed on write and on KB ingest; backfilled in batches.
- Embedding calls are cached by content hash to avoid recompute.
- Dimensionality is a system setting; changing it requires a re-embed migration.

## 11. Privacy & safety

- Memory MUST NOT store secrets, tokens, or raw PII. The write path scrubs known-sensitive
  fields.
- Audience reaction memories store aggregated/anonymised signals, not identifiable user
  data beyond platform-provided public content, subject to retention limits (doc 04 §16).

## 12. APIs (memory service)

| Method | Purpose |
|--------|---------|
| `memory.recall({namespace, query, filters, k})` | hybrid retrieval |
| `memory.writeEpisode({...})` | record an episode |
| `memory.upsertSemantic({...})` | create/update a semantic fact (rules gated) |
| `memory.promote({episodeIds})` | condense episodes → semantic |
| `memory.admin.compact()` / `.reembed()` / `.archive()` | maintenance (Memory Manager) |

All are exposed to agents as MCP-style tools with per-agent permissions (doc 08).

## 13. Evaluation

- **Recall hit-rate:** fraction of generations where an injected memory was demonstrably
  used/helpful (tracked via downstream approval/score).
- **Cold-start reduction:** measured drop in "from scratch" generations over time.
- **Index latency:** p95 recall query time.
- **Storage growth vs quality:** compaction keeps hot index bounded without hurting recall.

## 14. Failure handling

- Recall failure (DB/index down) → agent proceeds with KB-only + degraded flag; never blocks
  the run on memory alone.
- Embedding failure → queue for backfill; episode stored without embedding (excluded from
  vector recall until embedded).

## 15. Open questions

- OQ-01 Auto-promote episodes→semantic, or require Memory Manager review? (v1: auto for
  non-rule namespaces; review for rules.)
- OQ-02 Per-agent private memory vs shared pool for `winners`? (v1: shared, agent-tagged.)
- OQ-03 Decay half-life defaults per namespace — tune empirically post-M3.

*End of document 05.*
