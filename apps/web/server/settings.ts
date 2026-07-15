// apps/web/server/settings.ts
// Settings → Automation. Source: spec/07 §9, spec/14 §11 (daily budget cap, auto-approve policy
// + confidence, kill-switch — all backed by system_settings).
import 'server-only';
import { getPool } from './db.js';

export interface AutomationSettings {
  dailyBudgetUsd: number;
  paused: boolean;
  autoApprove: { enabled: boolean; min_confidence: number; formats: string[] };
}

export async function getAutomationSettings(): Promise<AutomationSettings | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<{ key: string; value: unknown }>(
      `select key, value from system_settings where key in ('budget.daily_usd','operation.paused','autoapprove.policy')`,
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const budget = map.get('budget.daily_usd');
    const paused = map.get('operation.paused');
    const policy = (map.get('autoapprove.policy') as AutomationSettings['autoApprove'] | undefined) ?? {
      enabled: false,
      min_confidence: 0.85,
      formats: [],
    };
    return {
      dailyBudgetUsd: typeof budget === 'number' ? budget : Number(budget ?? 25),
      paused: paused === true || (typeof paused === 'object' && (paused as { paused?: boolean })?.paused === true),
      autoApprove: { enabled: Boolean(policy.enabled), min_confidence: Number(policy.min_confidence ?? 0.85), formats: policy.formats ?? [] },
    };
  } catch {
    return null;
  }
}

async function upsert(key: string, value: unknown): Promise<void> {
  const p = getPool();
  if (!p) throw new Error('db unavailable');
  await p.query(
    `insert into system_settings (key, value) values ($1,$2)
     on conflict (key) do update set value=excluded.value, updated_at=now()`,
    [key, JSON.stringify(value)],
  );
}

export interface UpdateSettingsInput {
  dailyBudgetUsd?: number;
  paused?: boolean;
  autoApprove?: { enabled: boolean; min_confidence: number; formats: string[] };
}

export async function updateAutomationSettings(input: UpdateSettingsInput): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (typeof input.dailyBudgetUsd === 'number' && input.dailyBudgetUsd >= 0) await upsert('budget.daily_usd', input.dailyBudgetUsd);
    if (typeof input.paused === 'boolean') await upsert('operation.paused', input.paused);
    if (input.autoApprove) await upsert('autoapprove.policy', input.autoApprove);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
