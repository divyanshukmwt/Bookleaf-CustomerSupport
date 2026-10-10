'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { Conversation } from '@/components/Conversation';
import { Button, Card, ErrorBanner, inputClass, PageLoader, StatusBadge } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/auth';
import { applyRead, firstUnreadId, mergeMessages, unreadFor } from '@/lib/messages';
import type { AuthorTicket, Message } from '@/lib/types';

export default function AuthorTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<AuthorTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const [unreadFromId, setUnreadFromId] = useState<string | null>(null); // divider position, fixed when the page opens
  const [incoming, setIncoming] = useState(false); // "new message" pill while the conversation is open
  const dividerSet = useRef(false);

  const load = useCallback(() => {
    return api<{ ticket: AuthorTicket }>(`/tickets/${id}`)
      .then((r) => {
        // merge rather than replace, so a message that already arrived over the socket is never doubled
        setTicket((t) => ({ ...r.ticket, messages: mergeMessages(t?.messages ?? [], r.ticket.messages) }));
        if (!dividerSet.current) {
          dividerSet.current = true;
          setUnreadFromId(firstUnreadId(r.ticket.messages, 'AUTHOR'));
        }
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Ticket not found.' : errorMessage(e)));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // The server stores the read state; the UI only reflects it after the server confirms.
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    api(`/tickets/${id}/read`, { method: 'POST' })
      .then(() => setTicket((t) => (t ? { ...t, messages: applyRead(t.messages, 'AUTHOR', new Date().toISOString()) } : t)))
      .catch(() => undefined); // not fatal: the messages simply stay unread until next visit
  }, [id]);

  const hasUnread = ticket ? unreadFor(ticket.messages, 'AUTHOR').length > 0 : false;
  useEffect(() => {
    if (hasUnread) markRead();
  }, [hasUnread, markRead]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && hasUnread) markRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hasUnread, markRead]);

  // Realtime: the same message can arrive here and in an API response; mergeMessages keeps one copy.
  useSocketEvent<{ ticketId: string; message: Message }>('ticket:message', (p) => {
    if (p.ticketId !== id) return;
    setTicket((t) => (t ? { ...t, messages: mergeMessages(t.messages, p.message) } : t));
    if (p.message.senderRole === 'ADMIN') {
      setIncoming(true);
      setTimeout(() => setIncoming(false), 5000);
    }
  });
  useSocketEvent<{ ticketId: string }>('ticket:updated', (p) => { if (p.ticketId === id) void load(); });
  // staff opened the conversation: reload so "Seen" reflects the stored read time
  useSocketEvent<{ ticketId: string }>('ticket:read', (p) => { if (p.ticketId === id) void load(); });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Only shown as sent once the server confirms it was saved.
      const r = await api<{ message: Message; status: AuthorTicket['status'] }>(`/tickets/${id}/messages`, { method: 'POST', body: { body: reply } });
      setReply('');
      setTicket((t) => (t ? { ...t, status: r.status, messages: mergeMessages(t.messages, r.message) } : t));
    } catch (err) {
      setError(errorMessage(err)); // the draft text stays in the box so nothing is lost
    } finally {
      setBusy(false);
    }
  }

  if (!ticket) return error ? <ErrorBanner message={error} /> : <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/author/tickets" className="text-sm text-brand-600 hover:underline">← My Tickets</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">#{ticket.ticketNumber} · {ticket.subject}</h1>
          <p className="text-sm text-slate-500">{ticket.book ? ticket.book.title : 'General / Account Level'}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <ConnectionBanner />
      {incoming && <p role="status" aria-live="polite" className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">New message from BookLeaf Support</p>}
      <Card><Conversation messages={ticket.messages} perspective="AUTHOR" unreadFromId={unreadFromId} /></Card>
      <ErrorBanner message={error} />
      {ticket.status === 'CLOSED' ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">This ticket is closed. <Link href="/author/tickets/new" className="font-medium text-brand-600 hover:underline">Submit a new query</Link> if you need more help.</p>
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
