'use client';
// apps/web/ui/recommendation-actions.tsx
// Accept / Reject a recommendation. Source: spec/07 §6.2 (ranked cards with Accept/Reject →
// feeds ideation, doc 13 §7).
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RecommendationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function decide(decision: 'accepted' | 'rejected') {
    start(async () => {
      const res = await fetch(`/api/analytics/recommendations/${id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={pending}
        onClick={() => decide('accepted')}
        className="rounded bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
      >
        Accept
      </button>
      <button
        disabled={pending}
        onClick={() => decide('rejected')}
        className="rounded border border-rose-500/60 px-2.5 py-1 text-xs text-rose-300 hover:border-rose-400 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
