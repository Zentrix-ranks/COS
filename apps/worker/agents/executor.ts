// apps/worker/agents/executor.ts
// Generic agent executor lifecycle. Source: spec/03 §4.2 (receive → recall → assemble prompt
// → guarded model call → validate → outputs → memory write), spec/06 §11 (observability hooks).
import type { Pool } from '@cos/db';
import {
  type AgentContractLite,
  assemblePrompt,
  CREATIVE_SCHEMAS,
  CREATIVE_TASKS,
  type CreativeStageKey,
  type MemoryBlock,
  type PromptContext,
} from '@cos/prompts';
import type { PipelineStage, PipelineState, StageResult } from '@cos/shared';
import type { z } from 'zod';
import { guardedToolCall } from '../tools/guard.js';
import { recall, recallRecommendations, writeEpisode } from '../memory/service.js';
import type { ModelProvider } from '../model/provider.js';
import type { CanvaAdapter } from '../tools/canva.js';
import type { PublisherAdapter } from '../tools/instagram.js';

export interface ExecCtx {
  db: Pool;
  provider: ModelProvider;
  runId: string;
  tools: { canva: CanvaAdapter; instagram: PublisherAdapter };
  publish: (evt: { node: string; agentId: string; status: string; verb?: string }) => void;
}

/** One agent-run step within a pipeline node. */
export interface StageSpec<K extends CreativeStageKey> {
  node: string; // run_steps.node label (free text)
  kind: K;
  agentId: string;
  /** pipeline_stage enum row to write; omit for sub-steps (e.g. cta) that aren't enum stages. */
  pipelineStage?: PipelineStage;
  recallNamespace: string;
  buildCtx: (state: PipelineState) => PromptContext;
  apply: (state: PipelineState, output: z.infer<(typeof CREATIVE_SCHEMAS)[K]>) => void;
  /** For quality gates: derive pass/fail from output. Default: always pass. */
  gate?: (output: z.infer<(typeof CREATIVE_SCHEMAS)[K]>) => { passed: boolean; notes?: string | undefined };
}

let seq = 0;

export interface ModelPolicy {
  tier?: string;
  route?: string;
  temperature?: number;
  fallbacks?: string[];
}
type LoadedAgent = AgentContractLite & { modelPolicy: ModelPolicy };

async function loadAgent(db: Pool, id: string): Promise<LoadedAgent> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    department: string;
    goal: string;
    responsibilities: string[];
    tools: string[];
    reports_to: string | null;
    eval_policy: { primary?: string };
    model_policy: ModelPolicy | null;
  }>(
    `select id, name, department, goal, responsibilities, tools, reports_to, eval_policy, model_policy
       from agents where id = $1`,
    [id],
  );
  const a = rows[0];
  if (!a) throw new Error(`Agent '${id}' not found (seed the agents table)`);
  const lite: LoadedAgent = {
    id: a.id,
    name: a.name,
    department: a.department,
    goal: a.goal,
    responsibilities: a.responsibilities ?? [],
    tools: a.tools ?? [],
    reports_to: a.reports_to,
    modelPolicy: a.model_policy ?? {},
  };
  if (a.eval_policy?.primary) lite.eval_primary = a.eval_policy.primary;
  return lite;
}

/** Execute one stage: recall → prompt → model → validate → persist → memory → observe. */
export async function runStage<K extends CreativeStageKey>(
  ctx: ExecCtx,
  spec: StageSpec<K>,
  state: PipelineState,
): Promise<{ passed: boolean }> {
  const { db, provider, runId } = ctx;
  const agent = await loadAgent(db, spec.agentId);
  ctx.publish({ node: spec.node, agentId: spec.agentId, status: 'running', verb: spec.node });

  // 1. Recall (doc 05 §6). Winners for this format (hybrid vector query on the idea/hook) +
  //    brand rules + operator preferences.
  const query = `${state.ideaTitle} ${state.asset.hook ?? ''} ${state.ideaAngle ?? ''}`.trim();
  const [winners, brandRules, prefs] = await Promise.all([
    recall(db, { namespace: 'winners', filters: { format: state.format, outcome: 'success' }, query, k: 4 }),
    recall(db, { namespace: 'brand_rules', k: 5 }),
    recall(db, { namespace: 'writing_style', k: 3 }),
  ]);
  const memory: MemoryBlock = {
    winners: winners.map((w) => w.summary),
    failures: [],
    brand_rules: brandRules.map((r) => r.summary),
    preferences: prefs.map((p) => p.summary),
  };
  // Ideation is steered by analytics recommendations (doc 13 §7 → doc 12 §4.3).
  if (spec.kind === 'idea_generation') {
    const recs = await recallRecommendations(db, agent.department, 3);
    if (recs.length) {
      memory.recommendations = recs;
      state.memoryUsed.push(...recs.map((r) => `rec: ${r}`));
    }
  }
  state.memoryUsed.push(...memory.winners, ...memory.brand_rules);

  // 2. Assemble prompt (doc 09 §2).
  const promptCtx = spec.buildCtx(state);
  const task = CREATIVE_TASKS[spec.kind](promptCtx);
  const { system, user } = assemblePrompt({ agent, memory, task });

  // 3. Open a run_step (doc 04 §5.4). Log the recalled memory used this step so decisions are
  //    explainable in the Run Inspector (doc 05 §9: "every recall used ... logged on run_step").
  const recalled = [
    ...memory.winners.map((s) => `winner: ${s}`),
    ...memory.brand_rules.map((s) => `rule: ${s}`),
    ...memory.preferences.map((s) => `pref: ${s}`),
    ...(memory.recommendations ?? []).map((s) => `rec: ${s}`),
  ];
  const stepSeq = ++seq;
  const { rows: stepRows } = await db.query<{ id: string }>(
    `insert into run_steps (run_id, seq, node, agent_id, input, status)
     values ($1,$2,$3,$4,$5,'running') returning id`,
    [runId, stepSeq, spec.node, spec.agentId, JSON.stringify({ promptId: `${spec.agentId}.${spec.kind}.v1`, recalled })],
  );
  const stepId = stepRows[0]!.id;

  // 4. Guarded model call (doc 02 §6.3). Model access is a permitted tool for the agent.
  const schema = CREATIVE_SCHEMAS[spec.kind] as z.ZodType<z.infer<(typeof CREATIVE_SCHEMAS)[K]>>;
  // Per-stage model routing from the agent's model_policy (doc 09 §7). The mock provider ignores
  // the route; real providers (OpenRouter) honor it. The intended model is recorded on cost_ledger.
  const route = {
    model: agent.modelPolicy.route ?? 'mock',
    temperature: agent.modelPolicy.temperature ?? 0.7,
  };
  const result = await guardedToolCall(
    { agentId: spec.agentId, allowedTools: [...agent.tools, 'openrouter.generate'], db },
    'openrouter.generate',
    () =>
      provider.generate({
        agentId: spec.agentId,
        kind: spec.kind,
        system,
        user,
        schema,
        route,
        ctx: promptCtx,
      }),
  );
  const output = result.output;

  // 5. Apply to pipeline state + gate.
  spec.apply(state, output);
  const gate = spec.gate ? spec.gate(output) : { passed: true };
  const conf = (output as { confidence?: number }).confidence ?? state.confidence;
  const reasoning = (output as { reasoning_summary?: string }).reasoning_summary ?? '';
  state.confidence = Math.min(state.confidence, conf);
  if (spec.pipelineStage) {
    const sr: StageResult = { stage: spec.pipelineStage, passed: gate.passed, confidence: conf };
    if (gate.notes !== undefined) sr.notes = gate.notes;
    state.checks[spec.pipelineStage] = sr;
  }

  // 6. Persist asset snapshot (doc 04 §6.2).
  await persistAsset(db, state);

  // 7. pipeline_stage_runs row (doc 04 §6.4) for real enum stages.
  if (spec.pipelineStage) {
    await db.query(
      `insert into pipeline_stage_runs (asset_id, stage, status, agent_id, output, passed, notes, confidence, started_at, finished_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())`,
      [state.assetId, spec.pipelineStage, gate.passed ? 'passed' : 'failed', spec.agentId, JSON.stringify(output), gate.passed, gate.notes ?? null, conf],
    );
  }

  // 8. Close the run_step + cost ledger (doc 06 §11).
  await db.query(
    `update run_steps set output=$1, reasoning_summary=$2, status=$3, tokens_in=$4, tokens_out=$5, cost_usd=$6, finished_at=now() where id=$7`,
    [JSON.stringify(output), reasoning, gate.passed ? 'passed' : 'failed', result.usage.tokens_in, result.usage.tokens_out, result.usage.cost_usd, stepId],
  );
  await db.query(
    `insert into cost_ledger (run_id, agent_id, provider, model, tokens_in, tokens_out, usd)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [runId, spec.agentId, provider.name, route.model, result.usage.tokens_in, result.usage.tokens_out, result.usage.cost_usd],
  );

  // 9. Write an episode (doc 05 §5). Winning drafts feed future recall.
  await writeEpisode(db, {
    agentId: spec.agentId,
    namespace: 'tasks',
    assetId: state.assetId,
    summary: `${spec.node} on ${state.format} "${state.asset.title ?? ''}": ${gate.passed ? 'passed' : 'failed'}`,
    payload: { format: state.format, stage: spec.pipelineStage ?? spec.node, confidence: conf },
    outcome: gate.passed ? 'success' : 'failure',
  });

  ctx.publish({ node: spec.node, agentId: spec.agentId, status: gate.passed ? 'passed' : 'failed' });
  return { passed: gate.passed };
}

async function persistAsset(db: Pool, state: PipelineState): Promise<void> {
  const a = state.asset;
  await db.query(
    `update assets set
       title=$1, hook=$2, body=$3, caption=$4, hashtags=$5, cta=$6, confidence=$7,
       brand_checked=$8, updated_at=now()
     where id=$9`,
    [
      a.title ?? null,
      a.hook ?? null,
      JSON.stringify({ slides: a.slides ?? [] }),
      a.caption ?? null,
      a.hashtags ?? null,
      a.cta ? JSON.stringify(a.cta) : null,
      state.confidence,
      Boolean(state.checks.brand_review?.passed),
      state.assetId,
    ],
  );
}
