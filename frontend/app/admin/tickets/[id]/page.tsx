'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Conversation } from '@/components/Conversation';
import { Button, Card, ErrorBanner, inputClass, PageLoader, PriorityBadge, StatusBadge, Tag } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth, useSocketEvent } from '@/lib/auth';
import { CATEGORY_LABEL, fmtDateTime, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/format';
import type { AdminTicket, Draft } from '@/lib/types';

const ROUTE_LABEL: Record<Draft['route'], string> = {
  DB_ONLY: 'Answered from database (no AI)',
  KB_ONLY: 'Knowledge Base',
  HYBRID: 'Database + Knowledge Base',
  INSUFFICIENT_INFORMATION: 'Not enough information',
};

export default function AdminTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<AdminTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // reply composer + draft
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const filledFor = useRef<string | null>(null); // draft id already copied into the composer

  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);

  const load = useCallback(() => {
    return api<{ ticket: AdminTicket }>(`/admin/tickets/${id}`)
      .then((r) => { setTicket(r.ticket); return r.ticket; })
      .catch((e) => { setError(e instanceof ApiError && e.status === 404 ? 'Ticket not found.' : errorMessage(e)); return null; });
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useSocketEvent<{ ticketId: string }>('ticket:message', (p) => { if (p.ticketId === id) void load(); });
  useSocketEvent<{ ticketId: string }>('ticket:updated', (p) => { if (p.ticketId === id) void load(); });

  const lastMessageId = ticket?.messages[ticket.messages.length - 1]?.id;
  const lastFromAuthor = ticket?.messages[ticket.messages.length - 1]?.senderRole === 'AUTHOR';

  // Fetch the draft when the ticket is opened or a new author message arrives. The server reuses a
  // cached draft when nothing relevant changed, so refreshing the page costs no LLM call.
  const fetchDraft = useCallback(async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const r = await api<{ draft: Draft | null }>(`/admin/tickets/${id}/draft`);
      setDraft(r.draft);
    } catch (e) {
      setDraftError(errorMessage(e));
    } finally {
      setDraftLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (lastMessageId && lastFromAuthor) void fetchDraft();
    else setDraft(null);
  }, [lastMessageId, lastFromAuthor, fetchDraft]);

  // While the AI is generating, poll every 2s until it settles.
  useEffect(() => {
    if (draft?.status !== 'PROCESSING') return;
    const t = setInterval(() => {
      api<{ draft: Draft | null }>(`/admin/tickets/${id}/draft`).then((r) => r.draft && setDraft(r.draft)).catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [draft?.status, id]);

  // Pre-fill the editable composer once per draft (never overwrite what the admin is typing).
  useEffect(() => {
    if (draft?.body && draft.status === 'COMPLETED' && filledFor.current !== draft.id) {
      filledFor.current = draft.id;
      setReply((cur) => (cur.trim() ? cur : draft.body!));
    }
  }, [draft]);

  async function regenerate() {
    setDraftError(null);
    try {
      const r = await api<{ draft: Draft }>(`/admin/tickets/${id}/draft/regenerate`, { method: 'POST' });
      filledFor.current = null;
      setDraft(r.draft);
      if (r.draft.status === 'COMPLETED' && r.draft.body) { filledFor.current = r.draft.id; setReply(r.draft.body); }
    } catch (e) {
      setDraftError(errorMessage(e));
    }
  }

  async function update(patch: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ ticket: AdminTicket }>(`/admin/tickets/${id}`, { method: 'PATCH', body: patch });
      setTicket(r.ticket);
      setNotice(message);
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/admin/tickets/${id}/messages`, { method: 'POST', body: { body: reply } });
      setReply('');
      setNotice('Reply sent to the author');
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (noting || !note.trim()) return;
    setNoting(true);
    try {
      await api(`/admin/tickets/${id}/notes`, { method: 'POST', body: { body: note } });
      setNote('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setNoting(false);
    }
  }

  async function reclassify() {
    try {
      await api(`/admin/tickets/${id}/classify`, { method: 'POST' });
      setNotice('Classification retry started');
      setTimeout(() => void load(), 1500);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!ticket) return error ? <ErrorBanner message={error} /> : <PageLoader />;
  const closed = ticket.status === 'CLOSED';
  const mine = ticket.assignedTo?.id === user?.id;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-indigo-600 hover:underline">← Ticket Queue</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">#{ticket.ticketNumber} · {ticket.subject}</h1>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
      </div>
      <ErrorBanner message={error} />
      {notice && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Conversation"><Conversation messages={ticket.messages} perspective="ADMIN" authorName={ticket.author.user.name} /></Card>

          <Card title="Reply to author">
            <DraftPanel draft={draft} loading={draftLoading} error={draftError} awaitingAuthor={!lastFromAuthor} onRegenerate={regenerate} />
            <form onSubmit={send} className="mt-3 space-y-2">
              <textarea rows={9} maxLength={5000} className={inputClass} value={reply} onChange={(e) => setReply(e.target.value)} disabled={sending || closed} placeholder={closed ? 'This ticket is closed. Reopen it to reply.' : 'Write your reply, or use the AI draft above and edit it before sending…'} />
              <div className="flex justify-end">
                <Button type="submit" loading={sending} disabled={!reply.trim() || closed}>Send reply</Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Ticket controls">
            <div className="space-y-3 text-sm">
              <label className="block">Status
                <select className={inputClass} value={ticket.status} disabled={saving} onChange={(e) => void update({ status: e.target.value }, 'Status updated')}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block">Priority {ticket.aiPriority && <span className="text-xs text-slate-400">(AI suggested: {PRIORITY_LABEL[ticket.aiPriority]}{ticket.aiConfidence !== null ? `, ${(ticket.aiConfidence * 100).toFixed(0)}% confident` : ''})</span>}
                <select className={inputClass} value={ticket.priority ?? ''} disabled={saving} onChange={(e) => e.target.value && void update({ priority: e.target.value }, 'Priority updated')}>
                  <option value="" disabled>Unclassified</option>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block">Category {ticket.aiCategory && <span className="text-xs text-slate-400">(AI suggested: {CATEGORY_LABEL[ticket.aiCategory]})</span>}
                <select className={inputClass} value={ticket.category ?? ''} disabled={saving} onChange={(e) => e.target.value && void update({ category: e.target.value }, 'Category updated')}>
                  <option value="" disabled>Unclassified</option>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <div>
                <div className="mb-1">Assigned to: <strong>{ticket.assignedTo?.name ?? 'Nobody'}</strong></div>
                {mine ? (
                  <Button variant="secondary" disabled={saving} onClick={() => void update({ assignedToId: null }, 'Unassigned')}>Unassign me</Button>
                ) : (
                  <Button variant="secondary" disabled={saving} onClick={() => void update({ assignedToId: 'me' }, 'Assigned to you')}>Assign to me</Button>
                )}
              </div>
            </div>
          </Card>

          <Card title="AI classification">
            <div className="space-y-2 text-sm">
              <div>Status: {ticket.aiStatus === 'COMPLETED' ? <Tag tone="green">Completed</Tag> : ticket.aiStatus === 'FAILED' ? <Tag tone="red">Failed</Tag> : <Tag tone="indigo">{ticket.aiStatus === 'PENDING' ? 'Queued' : 'Processing'}</Tag>}</div>
              {ticket.aiStatus === 'FAILED' && (
                <>
                  <p className="text-xs text-red-700">{ticket.aiError ?? 'AI processing failed'}. Set the category and priority manually, or retry.</p>
                  <Button variant="secondary" onClick={() => void reclassify()}>Retry classification</Button>
                </>
              )}
              {ticket.categoryOverridden && <p className="text-xs text-slate-500">Category was set by an admin.</p>}
              {ticket.priorityOverridden && <p className="text-xs text-slate-500">Priority was set by an admin.</p>}
            </div>
          </Card>

          <Card title="Author & book">
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-slate-500">Author: </dt><dd className="inline">{ticket.author.user.name} ({ticket.author.authorCode})</dd></div>
              {ticket.author.city && <div><dt className="inline text-slate-500">City: </dt><dd className="inline">{ticket.author.city}</dd></div>}
              <div><dt className="inline text-slate-500">Book: </dt><dd className="inline">{ticket.book ? ticket.book.title : 'General / Account Level'}</dd></div>
              {ticket.book && <div><dt className="inline text-slate-500">Status: </dt><dd className="inline">{ticket.book.status}</dd></div>}
              {ticket.book && <div><dt className="inline text-slate-500">Royalty pending: </dt><dd className="inline">₹{ticket.book.royaltyPending.toLocaleString('en-IN')}</dd></div>}
            </dl>
          </Card>

          <Card title="Internal notes (not visible to the author)">
            <div className="space-y-2">
              {ticket.internalNotes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
              {ticket.internalNotes.map((n) => (
                <div key={n.id} className="rounded-md bg-yellow-50 p-2 text-sm">
                  <p className="whitespace-pre-wrap break-words">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{n.createdBy.name} · {fmtDateTime(n.createdAt)}</p>
                </div>
              ))}
              <form onSubmit={addNote} className="space-y-2 pt-1">
                <textarea rows={2} maxLength={2000} className={inputClass} placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} disabled={noting} />
                <Button type="submit" variant="secondary" loading={noting} disabled={!note.trim()}>Add note</Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ draft, loading, error, awaitingAuthor, onRegenerate }: { draft: Draft | null; loading: boolean; error: string | null; awaitingAuthor: boolean; onRegenerate: () => void }) {
  const box = 'rounded-md border px-3 py-2 text-sm';
  const regen = <Button variant="secondary" onClick={onRegenerate} disabled={draft?.status === 'PROCESSING'}>{draft ? 'Regenerate draft' : 'Generate draft'}</Button>;

  if (awaitingAuthor && !draft) {
    return <div className={`${box} flex items-center justify-between gap-3 border-slate-200 bg-slate-50 text-slate-600`}><span>You replied last. A draft will be prepared when the author writes back.</span>{regen}</div>;
  }
  if (loading && !draft) return <div className={`${box} flex items-center gap-2 border-indigo-200 bg-indigo-50 text-indigo-800`}><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Preparing a draft…</div>;
  if (error) return <div className={`${box} border-red-200 bg-red-50 text-red-800`}>{error}</div>;
  if (!draft) return null;

  if (draft.status === 'PROCESSING') {
    return <div className={`${box} flex items-center gap-2 border-indigo-200 bg-indigo-50 text-indigo-800`}><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />AI is drafting a reply from the Knowledge Base and author data…</div>;
  }
  if (draft.status === 'FAILED') {
    return (
      <div className={`${box} border-red-200 bg-red-50 text-red-800`}>
        <p>{draft.error ?? 'Draft generation failed.'} You can still write the reply manually below.</p>
        <div className="mt-2">{regen}</div>
      </div>
    );
  }
  if (draft.route === 'INSUFFICIENT_INFORMATION' && !draft.body) {
    return <div className={`${box} border-amber-200 bg-amber-50 text-amber-900`}><p>{draft.error ?? 'Not enough verified information for an automated draft.'}</p><div className="mt-2">{regen}</div></div>;
  }
  if (draft.validationStatus === 'REJECTED') {
    return (
      <div className={`${box} border-red-200 bg-red-50 text-red-800`}>
        <p className="font-medium">The AI draft was withheld because it contradicted verified data.</p>
        <ul className="mt-1 list-disc pl-5 text-xs">{draft.validationIssues?.filter((i) => i.severity === 'error').map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul>
        <div className="mt-2">{regen}</div>
      </div>
    );
  }
  return (
    <div className={`${box} border-indigo-200 bg-indigo-50 text-indigo-900`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="indigo">{draft.source === 'AI' ? 'AI draft' : 'Template draft (no AI)'}</Tag>
          <Tag>{draft.route === 'INSUFFICIENT_INFORMATION' ? 'Outside support scope (no author data used)' : ROUTE_LABEL[draft.route]}</Tag>
          {draft.validationStatus === 'PASSED' && <Tag tone="green">Checks passed</Tag>}
          {draft.validationStatus === 'FLAGGED' && <Tag tone="amber">Review needed</Tag>}
        </div>
        {regen}
      </div>
      <p className="mt-2 text-xs">Review and edit before sending: you are responsible for what the author receives.</p>
      {draft.validationStatus === 'FLAGGED' && (
        <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">{draft.validationIssues?.map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul>
      )}
    </div>
  );
}