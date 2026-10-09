'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, PageLoader, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import type { AuthorTicketSummary } from '@/lib/types';

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<AuthorTicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: AuthorTicketSummary[] }>('/tickets').then((r) => setTickets(r.items)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  // Near-real-time: an admin reply or status change refreshes the list without a page reload.
  useSocketEvent('ticket:message', load);
  useSocketEvent('ticket:updated', load);

  if (error) return <ErrorBanner message={error} />;
  if (!tickets) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Tickets</h1>
        <Link href="/author/tickets/new"><Button>New query</Button></Link>
      </div>
      {tickets.length === 0 ? (
        <EmptyState title="You haven't submitted any queries yet" hint="Have a question about royalties, your ISBN, printing or your book's status? We're here to help." action={<Link href="/author/tickets/new"><Button>Submit a query</Button></Link>} />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link key={t.id} href={`/author/tickets/${t.id}`} className="block">
              <Card className="transition hover:border-indigo-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">#{t.ticketNumber} · {t.subject}</p>
                    <p className="text-xs text-slate-500">{t.book ? t.book.title : 'General / Account Level'} · {t._count.messages} message{t._count.messages === 1 ? '' : 's'} · Updated {fmtDateTime(t.lastMessageAt)}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
