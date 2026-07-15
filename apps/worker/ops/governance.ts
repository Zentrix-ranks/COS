// apps/worker/ops/governance.ts
// Safety & governance: kill-switch and budget caps. Source: spec/14 §8 (pause the operation;
// daily $ cap halts generation, operator alerted), spec/02 §8.3 (per-run/day budgets, hard stop
// + alert), spec/01 §9 (cost control NFR).
import type { Pool } from '@cos/db';

export class OperationPausedError extends Error {
  constructor() {
    super('operation is paused (kill-switch)');
    this.name = 'OperationPausedError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    readonly spend: number,
    readonly cap: number,
  ) {
    super(`daily budget exceeded: $${spend.toFixed(4)} ≥ cap $${cap.toFixed(2)}`);
    this.name = 'BudgetExceededError';
  }
}

/** Kill-switch (doc 14 §8): ceo/ops_lead/operator can pause; jobs short-circuit, runs hold. */
export async function isOperationPaused(db: Pool): Promise<boolean> {
  try {
    const { rows } = await db.query<{ value: boolean | { paused?: boolean } }>(
      `select value from system_settings where key='operation.paused'`,
    );
    const v = rows[0]?.value;
    if (typeof v === 'boolean') return v;
    return Boolean(v?.paused);
  } catch {
    return false;
  }
}

export async function getDailySpendUsd(db: Pool): Promise<number> {
  const { rows } = await db.query<{ spend: string }>(
    `select coalesce(sum(usd),0) as spend from cost_ledger where created_at::date = now()::date`,
  );
  return Number(rows[0]?.spend ?? 0);
}

export async function getDailyBudgetUsd(db: Pool): Promise<number> {
  const { rows } = await db.query<{ value: number }>(`select value from system_settings where key='budget.daily_usd'`);
  const v = rows[0]?.value;
  return typeof v === 'number' ? v : Number(v ?? 25);
}

/** Hard budget check (doc 02 §8.3): throws BudgetExceededError when the daily cap is reached. */
export async function assertWithinBudget(db: Pool): Promise<void> {
  const [spend, cap] = await Promise.all([getDailySpendUsd(db), getDailyBudgetUsd(db)]);
  if (cap > 0 && spend >= cap) throw new BudgetExceededError(spend, cap);
}
