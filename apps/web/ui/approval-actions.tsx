'use client';
// apps/web/ui/approval-actions.tsx
// Approve / Request changes / Reject actions. Source: spec/07 §7 (one-click decisions +
// optional note). Posts to /api/approvals/:id/decision and refreshes the queue.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approved' | 'changes_requested' | 'rejected';

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function decide(decision: Decision) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (learned from — doc 05)"
        aria-label="Decision note (optional)"
        className="w-full rounded border border-edge bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => decide('approved')}
          className="rounded bg-emerald-500/90 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={pending}
          onClick={() => decide('changes_requested')}
          className="rounded border border-amber-400/60 px-3 py-1 text-sm text-amber-200 hover:border-amber-300 disabled:opacity-50"
        >
          Request changes
        </button>
        <button
          disabled={pending}
          onClick={() => decide('rejected')}
          className="rounded border border-rose-500/60 px-3 py-1 text-sm text-rose-300 hover:border-rose-400 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
