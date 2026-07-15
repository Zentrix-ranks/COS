'use client';
// apps/web/ui/settings-form.tsx
// Settings → Automation controls. Source: spec/07 §9, spec/14 §11 (budget cap, kill-switch,
// auto-approve policy). Writes via POST /api/settings.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Settings {
  dailyBudgetUsd: number;
  paused: boolean;
  autoApprove: { enabled: boolean; min_confidence: number; formats: string[] };
}

const ALL_FORMATS = ['carousel', 'reel', 'story', 'image'];

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<Settings>(initial);
  const [saved, setSaved] = useState(false);

  function save(next: Partial<Settings>) {
    const merged = { ...s, ...next };
    setS(merged);
    setSaved(false);
    start(async () => {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function toggleFormat(f: string) {
    const formats = s.autoApprove.formats.includes(f)
      ? s.autoApprove.formats.filter((x) => x !== f)
      : [...s.autoApprove.formats, f];
    save({ autoApprove: { ...s.autoApprove, formats } });
  }

  return (
    <div className="space-y-6">
      {/* Kill-switch */}
      <section className="rounded-lg border border-edge bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Operation</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm">
            {s.paused ? '⏸ Paused — generation halted; runs hold at checkpoints.' : '● Running normally.'}
          </span>
          <button
            disabled={pending}
            onClick={() => save({ paused: !s.paused })}
            aria-pressed={s.paused}
            className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
              s.paused ? 'bg-emerald-500/90 text-black hover:bg-emerald-400' : 'border border-rose-500/60 text-rose-300 hover:border-rose-400'
            }`}
          >
            {s.paused ? 'Resume operation' : 'Pause operation (kill-switch)'}
          </button>
        </div>
      </section>

      {/* Budget */}
      <section className="rounded-lg border border-edge bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Daily budget cap (USD)</h2>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            defaultValue={s.dailyBudgetUsd}
            aria-label="Daily budget cap in USD"
            onBlur={(e) => save({ dailyBudgetUsd: Number(e.target.value) })}
            className="w-32 rounded border border-edge bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs text-muted">Hard cap — generation halts + alerts on breach.</span>
        </div>
      </section>

      {/* Auto-approve */}
      <section className="rounded-lg border border-edge bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Auto-approve policy (approve-by-exception)</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.autoApprove.enabled} onChange={(e) => save({ autoApprove: { ...s.autoApprove, enabled: e.target.checked } })} />
          Enabled
        </label>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span>Min confidence</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={s.autoApprove.min_confidence}
            aria-label="Auto-approve minimum confidence"
            onBlur={(e) => save({ autoApprove: { ...s.autoApprove, min_confidence: Number(e.target.value) } })}
            className="w-24 rounded border border-edge bg-surface px-2 py-1 outline-none focus:border-accent"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {ALL_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.autoApprove.formats.includes(f)} onChange={() => toggleFormat(f)} />
              {f}
            </label>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted" aria-live="polite">
        {pending ? 'Saving…' : saved ? 'Saved.' : ''}
      </p>
    </div>
  );
}
