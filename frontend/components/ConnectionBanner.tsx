'use client';

import { useAuth } from '@/lib/auth';

// Shows realtime connection problems only. Messages are stored first, so nothing is lost while offline;
// the page simply stops updating live until the connection returns.
export function ConnectionBanner() {
  const { connection } = useAuth();
  if (connection === 'connected' || connection === 'connecting') return null;
  const text =
    connection === 'reconnecting'
      ? 'Reconnecting to live updates… new messages will appear once the connection returns.'
      : 'Live updates are unavailable right now. Refresh the page to see new messages.';
  return (
    <div role="status" aria-live="polite" className={`rounded-md border px-3 py-2 text-sm ${connection === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      {text}
    </div>
  );
}
