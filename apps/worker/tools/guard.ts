// apps/worker/tools/guard.ts
// Tool-call guard. Source: spec/02-system-architecture.md §6.3 (permission → rate/budget →
// invoke → record), spec/08 §2/§13 (per-agent permissions), spec/02 §8.3/§8.4 (budget cap +
// circuit breaker). Every tool call passes through this seam: permission → breaker → budget →
// invoke → record breaker result.
import type { Pool } from '@cos/db';
import { BreakerOpenError, checkBreaker, recordToolResult } from './breaker.js';
import { RateLimitError, takeToken } from './ratelimit.js';
import { assertWithinBudget } from '../ops/governance.js';

export interface ToolContext {
  agentId: string;
  runStepId?: string;
  /** Tool ids this agent is permitted to call (agents.permissions.tools, doc 04 §5.1). */
  allowedTools: string[];
  /** DB handle enables breaker + budget enforcement (omit for pure/unguarded calls). */
  db?: Pool;
}

export class ToolPermissionError extends Error {
  constructor(agentId: string, tool: string) {
    super(`Agent '${agentId}' is not permitted to call tool '${tool}'`);
    this.name = 'ToolPermissionError';
  }
}

export { BreakerOpenError, RateLimitError };

export async function guardedToolCall<T>(ctx: ToolContext, tool: string, invoke: () => Promise<T>): Promise<T> {
  // 1. Permission gate (doc 02 §6.3 step 1).
  if (!ctx.allowedTools.includes(tool)) {
    throw new ToolPermissionError(ctx.agentId, tool);
  }
  if (!ctx.db) return invoke();

  // 2. Rate limit (doc 02 §6.3 step 2, doc 08 §2.1): per-tool token bucket.
  const rl = await takeToken(tool);
  if (!rl.allowed) throw new RateLimitError(tool);
  // 3. Circuit breaker (doc 06 §7): short-circuit rather than retry-storm a downed tool.
  await checkBreaker(ctx.db, tool);
  // 4. Budget cap (doc 02 §8.3): hard stop before spending more when the daily cap is hit.
  await assertWithinBudget(ctx.db);

  // 4. Invoke + record breaker result (success closes, failures may open the breaker).
  try {
    const out = await invoke();
    await recordToolResult(ctx.db, tool, true);
    return out;
  } catch (err) {
    if (!(err instanceof BreakerOpenError)) await recordToolResult(ctx.db, tool, false, err);
    throw err;
  }
}
