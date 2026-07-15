'use client';
// apps/web/ui/realtime-refresher.tsx
// Subscribes to the SSE realtime stream (doc 07 §5.2) and refreshes the server-rendered
// Mission Control data when the worker emits run status events. Keeping data in the RSC and
// only triggering a refresh here avoids a parallel JSON API for M0.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Conn = 'connecting' | 'live' | 'offline';

export function RealtimeRefresher() {
  const router = useRouter();
  const [conn, setConn] = useState<Conn>('connecting');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    const refresh = () => {
      // Debounce bursts of events into a single server refetch.
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 250);
    };

    es.addEventListener('realtime.ready', () => setConn('live'));
    es.addEventListener('realtime.offline', () => setConn('offline'));
    es.addEventListener('realtime.error', () => setConn('offline'));
    es.addEventListener('run.status', refresh);
    es.onopen = () => setConn((c) => (c === 'offline' ? c : 'live'));
    es.onerror = () => setConn('offline');

    return () => {
      if (pending.current) clearTimeout(pending.current);
      es.close();
    };
  }, [router]);

  const label = conn === 'live' ? 'live' : conn === 'connecting' ? 'connecting…' : 'offline';
  const dot = conn === 'live' ? 'bg-emerald-400' : conn === 'connecting' ? 'bg-amber-400' : 'bg-slate-500';

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" title="Realtime stream (SSE)">
      <span className={`h-2 w-2 rounded-full ${dot} ${conn === 'live' ? 'animate-pulse' : ''}`} />
      realtime: {label}
    </span>
  );
}
