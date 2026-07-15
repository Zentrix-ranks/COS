# 06 — Workflow Engine Specification

**Document:** 06 of 16 · **Status:** Baseline · **Owner:** Agent Engineering

---

## 1. Purpose

The workflow engine is how COS coordinates agents deterministically and resumably. It is
built on **LangGraph**: explicit state machines (graphs) of nodes (agents/functions) with
durable checkpoints, conditional edges, retries, and **human-in-the-loop (HITL)** gates.
This document defines the graph model, the core graphs, state, checkpointing, retries,
HITL, budgets, and observability hooks.

## 2. Core concepts

| Concept | Definition |
|---------|-----------|
| **Graph** | A named state machine (e.g., `pipeline`, `ceo`, `strategy`). |
| **Node** | A step: runs an agent executor or a pure function. |
| **Edge** | Transition; may be conditional on state. |
| **State** | Typed, serializable object threaded through the graph (checkpointed). |
| **Checkpoint** | Persisted snapshot of state at a node boundary → resumability. |
| **Interrupt** | A pause point (HITL) that suspends the run until an external event. |
| **Run** | One execution instance of a graph (row in `runs`, doc 04 §5.3). |

## 3. State model

Each graph declares a typed state. Example pipeline state:

```ts
type PipelineState = {
  assetId: string;
  stage: PipelineStage;              // enum, doc 04
  asset: AssetSnapshot;              // current content
  memory: RecalledContext;           // injected recall (doc 05)
  checks: Record<Stage, StageResult>;// pass/fail per stage
  confidence: number;                // rolling
  needsApproval: boolean;
  budget: { tokens: number; usd: number; steps: number };
  errors: StageError[];
  correlationId: string;
};
```

State is JSON-serializable and persisted to `runs.checkpoint` after every node.

## 4. Checkpointing & resumability

- The engine writes a checkpoint **after every node** completes.
- On worker crash/restart, a supervisor re-queues incomplete runs; the graph resumes from
  the last checkpoint — **no node re-executes its side effects** because outward actions
  are idempotent (doc 02 §8.4).
- Checkpoints are stored in Postgres (`runs.checkpoint`) — durable and inspectable, so the
  Run Inspector (doc 07) can render exactly where a run is.
- A `step_budget`/`steps_used` guard prevents infinite graphs.

## 5. The core graphs

### 5.1 `ceo` graph (daily orchestration)

```
start ─► load_objectives ─► strategy(subgraph) ─► ideation(subgraph)
      ─► fan_out_assets ─► [pipeline(subgraph) per asset]  (map)
      ─► collect_results ─► publish_ready ─► daily_summary ─► end
```

- `fan_out_assets` maps N approved ideas to N pipeline subgraph runs (bounded concurrency).
- `daily_summary` writes the operator summary and notifications.

### 5.2 `pipeline` graph (per asset — the 20 stages)

Nodes correspond 1:1 to `pipeline_stage` enum (doc 04 §3, detailed in doc 12):

```
trend_detection ─► research ─► idea_generation ─► hook_creation ─► outline ─►
draft ─► brand_review ─► grammar ─► seo ─► ig_optimisation ─► design ─►
thumbnail ─► approval(HITL) ─► scheduling ─► publishing ─► analytics ─►
learning ─► memory_update ─► end
```

Conditional edges:

- After `brand_review`/`grammar`/`seo`/`ig_optimisation`/`visual QA`: if `failed`, loop
  back to `draft`/`design` (bounded revision count, default 2) else continue.
- Before `approval`: if `confidence ≥ threshold` **and** auto-approve enabled for this
  asset type → skip HITL; else `interrupt` for human decision.
- After `approval`: `approved` → scheduling; `changes_requested` → back to `draft` with the
  operator note injected into memory; `rejected` → archive.

### 5.3 Department subgraphs

`strategy`, `creative`, `design`, `publishing`, `analytics`, `operations` are subgraphs a
department head runs to coordinate its specialists. Each: dispatch → gather → review →
report-up. They are invoked by the `ceo` graph or independently by automation (doc 14).

## 6. HITL (human-in-the-loop)

- HITL is modelled as a LangGraph **interrupt**: the node emits an `approvals` row (doc 04
  §7.1), sets `runs.status='paused'`, and returns control.
- The Approval service (doc 02 §3.1) resolves it: on decision it writes the outcome and
  **enqueues a resume** job that re-enters the graph at the approval node with the decision
  in state.
- Multiple assets can be paused simultaneously; each is an independent interrupted run.
- Timeouts: if an approval is pending beyond a configurable SLA, escalate via Notification
  Manager (and optionally auto-hold to the next day).

## 7. Retry & error policy

Per-node retry config (from the agent contract, doc 03 §4.1):

```jsonc
{ "max_attempts": 3, "backoff": "exp:2s", "jitter": true,
  "retryable": ["tool_timeout","rate_limit","5xx","network"] }
```

- **Retryable** errors: transient tool/model/network failures → backoff + retry.
- **Non-retryable** errors (validation, permission denied, budget exceeded): no retry →
  failure handling.
- On exhausted retries, apply the agent's `failure_policy`: `fallback` (cheaper model /
  simpler path), `escalate` (to department head/CEO/operator), or `park` (leave run paused,
  resumable).
- **Circuit breaker:** if a tool's breaker is open (doc 03 §11.5), nodes depending on it
  short-circuit to degraded/manual-assist rather than retry-storm.
- **Dead-letter:** poison jobs (repeatedly failing, non-resumable) move to a DLQ with an
  alert for operator/Ops.

### 7.1 Revision loops (bounded)

Quality-gate failures (brand/grammar/SEO/visual QA) loop back to the producing node with the
failure notes injected. A `revision_count` in state caps loops (default 2); on cap, route to
HITL rather than loop forever.

## 8. Budgets & guards

- **Step budget** (`runs.step_budget`): max node executions; exceed → park + escalate.
- **Time budget:** wall-clock per run; exceed → checkpoint + escalate.
- **Cost budget:** per-run and per-day $ caps (doc 02 §8.3); exceed → hard stop + alert.
- Guards are enforced by a middleware wrapping every node execution.

## 9. Concurrency & scheduling

- The `ceo` fan-out bounds concurrent pipeline runs (default N=6) to respect tool rate
  limits and budgets.
- Workers pull runs/jobs from BullMQ (doc 14); concurrency is tuned per queue and per tool.
- Long-running graphs yield at checkpoints so workers stay responsive and horizontally
  scalable (doc 02 §8.5).

## 10. Determinism & idempotency

- Node functions are written to be **idempotent**: re-running a node with the same state
  produces the same effect (outward actions guarded by idempotency keys, doc 04).
- Non-deterministic model output is tolerated by design (creative work), but *control flow*
  is deterministic given state; branching depends only on recorded `checks`/`confidence`.

## 11. Observability hooks

Every node execution emits:

- a `run_steps` row (doc 04 §5.4) with input/output/reasoning summary/status/cost;
- `tool_calls` rows for each tool invocation;
- realtime events (Redis pub/sub → dashboard) for live status ("Creative Director:
  Generating Reel #52");
- cost entries to `cost_ledger`.

The Run Inspector (doc 07) reconstructs the full run from these rows, including the graph
path taken, memories used, tools called, and where an interrupt occurred.

## 12. Graph definition example (illustrative)

```ts
const pipeline = new StateGraph<PipelineState>({ channels: pipelineChannels })
  .addNode("draft", draftNode)
  .addNode("brand_review", brandReviewNode)
  .addNode("approval", approvalInterruptNode)   // interrupts on needsApproval
  .addNode("publishing", publishNode)
  // ...all 20 stages...
  .addEdge("draft", "brand_review")
  .addConditionalEdges("brand_review", r =>
    r.checks.brand_review.passed ? "grammar"
      : r.revisionCount < 2 ? "draft" : "approval")
  .addConditionalEdges("approval", r =>
    r.decision === "approved" ? "scheduling"
      : r.decision === "changes_requested" ? "draft" : "archive")
  .compile({ checkpointer: postgresCheckpointer });
```

## 13. Testing workflows

- **Unit:** each node function tested with fixture state.
- **Contract:** each agent's I/O validated against its typed contract (doc 03/10).
- **Graph simulation:** run graphs with mocked tools to assert control flow (happy paths,
  each failure branch, HITL interrupt/resume, budget breach).
- **Chaos:** kill workers mid-run to verify resumability and no double side-effects.

## 14. Open questions

- OQ-01 Checkpointer: Postgres-backed (chosen for inspectability) vs Redis for speed — start
  Postgres; add Redis cache if latency demands.
- OQ-02 Max fan-out concurrency default (6) — tune against tool rate limits in staging.
- OQ-03 Revision-loop cap (2) per gate vs global — start per-gate.

*End of document 06.*
