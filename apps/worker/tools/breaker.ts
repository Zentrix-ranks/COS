// apps/worker/tools/breaker.ts
// Circuit breaker for flaky tools. Source: spec/02 §8.4 (circuit breakers on flaky tools),
// spec/06 §7 (breaker open → dependent nodes short-circuit rather than retry-storm), spec/04
// §11 (tool_status). Opens after N consecutive failures; half-opens after a cooldown.
import type { Pool } from '@cos/db';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

export class BreakerOpenError extends Error {
  constructor(tool: string) {
    super(`circuit breaker open for tool '${tool}'`);
    this.name = 'BreakerOpenError';
  }
}

interface ToolStatusRow {
  breaker_open: boolean;
  last_ok_at: string | null;
  last_error: { fails?: number; opened_at?: number } | null;
}

/** Throw if the breaker is open and still within cooldown (doc 06 §7). */
export async function checkBreaker(db: Pool, tool: string): Promise<void> {
  const { rows } = await db.query<ToolStatusRow>(
    `select breaker_open, last_ok_at, last_error from tool_status where tool=$1`,
    [tool],
  );
  const s = rows[0];
  if (!s?.breaker_open) return;
  const openedAt = s.last_error?.opened_at ?? 0;
  if (Date.now() - openedAt < COOLDOWN_MS) throw new BreakerOpenError(tool);
  // Cooldown elapsed → allow a half-open trial (the next call decides open/close).
}

export async function recordToolResult(db: Pool, tool: string, ok: boolean, error?: unknown): Promise<void> {
  if (ok) {
    await db.query(
      `insert into tool_status (tool, healthy, breaker_open, last_ok_at, last_error, updated_at)
       values ($1, true, false, now(), '{}'::jsonb, now())
       on conflict (tool) do update set healthy=true, breaker_open=false, last_ok_at=now(), last_error='{}'::jsonb, updated_at=now()`,
      [tool],
    );
    return;
  }
  const { rows } = await db.query<{ last_error: { fails?: number } | null }>(`select last_error from tool_status where tool=$1`, [tool]);
  const fails = (rows[0]?.last_error?.fails ?? 0) + 1;
  const open = fails >= FAILURE_THRESHOLD;
  const lastError = { fails, message: String((error as Error)?.message ?? error), ...(open ? { opened_at: Date.now() } : {}) };
  await db.query(
    `insert into tool_status (tool, healthy, breaker_open, last_error, updated_at)
     values ($1, false, $2, $3, now())
     on conflict (tool) do update set healthy=false, breaker_open=$2, last_error=$3, updated_at=now()`,
    [tool, open, JSON.stringify(lastError)],
  );
}
