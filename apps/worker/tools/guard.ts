// apps/worker/tools/guard.ts
// MCP tool-call guard scaffold. Source: spec/02-system-architecture.md §6.3 (guarded tool call)
// + spec/08-tool-integration.md §2/§13 (per-agent permissions, rate limits, budgets).
// M0 provides the guard seam every tool call must pass through; concrete rate-limit/budget
// backends (Redis token bucket, cost ledger) are wired in M0→M1 as the runtime fills in.
import type { Pool } from '@cos/db';

export interface ToolContext {
  agentId: string;
  runStepId?: string;
  /** Tool ids this agent is permitted to call (agents.permissions.tools, doc 04 §5.1). */
  allowedTools: string[];
}

export class ToolPermissionError extends Error {
  constructor(agentId: string, tool: string) {
    super(`Agent '${agentId}' is not permitted to call tool '${tool}'`);
    this.name = 'ToolPermissionError';
  }
}

/**
 * Runs a tool invocation through the permission gate (doc 02 §6.3 step 1). Rate-limit and
 * budget checks (steps 2–3) and tool_calls audit logging land alongside the MCP clients.
 */
export async function guardedToolCall<T>(
  ctx: ToolContext,
  tool: string,
  invoke: () => Promise<T>,
  _db?: Pool,
): Promise<T> {
  if (!ctx.allowedTools.includes(tool)) {
    throw new ToolPermissionError(ctx.agentId, tool);
  }
  // TODO(M0→M1): rate-limit (Redis token bucket) → budget check → invoke → record
  // tool_calls row (args/result/ok/latency_ms/cost_usd, doc 04 §5.5) + cost_ledger.
  return invoke();
}
