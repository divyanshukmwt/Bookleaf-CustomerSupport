'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Conversation } from '@/components/Conversation';
import { Button, Card, ErrorBanner, inputClass, PageLoader, StatusBadge } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/auth';
import type { AuthorTicket, Message } from '@/lib/types';

export default function AuthorTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<AuthorTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ ticket: AuthorTicket }>(`/tickets/${id}`)
      .then((r) => setTicket(r.ticket))
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Ticket not found.' : errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  // Realtime: append the admin's reply instantly (de-duplicated); refresh status changes.
  useSocketEvent<{ ticketId: string; message: Message }>('ticket:message', (p) => {
    if (p.ticketId !== id) return;
    setTicket((t) => (t && !t.messages.some((m) => m.id === p.message.id) ? { ...t, messages: [...t.messages, p.message] } : t));
  });
  useSocketEvent<{ ticketId: string }>('ticket:updated', (p) => {
    if (p.ticketId === id) load();
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/tickets/${id}/messages`, { method: 'POST', body: { body: reply } });
      setReply('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ticket) return error ? <ErrorBanner message={error} /> : <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/author/tickets" className="text-sm text-indigo-600 hover:underline">← My Tickets</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">#{ticket.ticketNumber} · {ticket.subject}</h1>
          <p className="text-sm text-slate-500">{ticket.book ? ticket.book.title : 'General / Account Level'}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <Card><Conversation messages={ticket.messages} perspective="AUTHOR" /></Card>
      <ErrorBanner message={error} />
      {ticket.status === 'CLOSED' ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">This ticket is closed. <Link href="/author/tickets/new" className="font-medium text-indigo-600 hover:underline">Submit a new query</Link> if you need more help.</p>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <textarea rows={3} maxLength={5000} className={inputClass} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{ticket.status === 'RESOLVED' ? 'Replying will reopen this ticket.' : ''}</p>
            <Button type="submit" loading={busy} disabled={!reply.trim()}>Send reply</Button>
          </div>
        </form>
      )}
    </div>
  );
}
