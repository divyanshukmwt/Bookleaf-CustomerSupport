'use client';

import { Card, Tag } from '@/components/ui';
import { CHECKS_SCOPE, verificationFor } from '@/lib/draftVerification';
import { CATEGORY_LABEL, INTENT_LABEL } from '@/lib/format';
import type { AdminTicket, ContextSnapshot, Draft } from '@/lib/types';

// Everything an admin needs to check a draft against its sources. Three kinds of content are kept
// visibly apart: database facts, knowledge-base references, and (in the composer) AI-written text.
export function TicketContextPanel({ ticket, draft, context, loading }: { ticket: AdminTicket; draft: Draft | null; context: ContextSnapshot | null; loading: boolean }) {
  // Prefer what the stored draft was actually built from; fall back to the live view.
  const ctx = draft?.context ?? context;
  const fromDraft = Boolean(draft?.context);
  const v = verificationFor(draft);
  const tone = { NONE: 'slate', NOT_CHECKED: 'slate', PASSED: 'green', FLAGGED: 'amber', WITHHELD: 'red' } as const;

  return (
    <div className="space-y-4" aria-label="Ticket context">
      <Card title="Ticket">
        <dl className="space-y-1.5 text-sm">
          <Row k="Author" v={`${ticket.author.user.name} (${ticket.author.authorCode})`} />
          <Row k="Book" v={ticket.book ? `${ticket.book.title}` : 'General / account level'} />
          {ticket.book && <Row k="Book status" v={ticket.book.status} />}
          <Row k="Category" v={ticket.category ? CATEGORY_LABEL[ticket.category] : 'Unclassified'} />
          <Row k="Intent" v={ticket.intent ? (INTENT_LABEL[ticket.intent] ?? ticket.intent) : 'Not determined'} />
          <Row k="Priority" v={ticket.priority ? ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase() : 'Unclassified'} />
          <Row k="AI confidence" v={ticket.aiConfidence !== null ? `${Math.round(ticket.aiConfidence * 100)}%` : 'Not available'} />
        </dl>
      </Card>

      <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4" aria-labelledby="ctx-facts">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="ctx-facts" className="text-sm font-semibold text-slate-700">Database facts</h2>
          <Tag tone="green">Source: BookLeaf database</Tag>
        </div>
        {loading && !ctx && <p className="text-sm text-slate-500">Loading context…</p>}
        {ctx && !ctx.facts && <p className="text-sm text-slate-600">{ctx.scope === 'OUT_OF_SCOPE' || ctx.scope === 'UNCLEAR' ? 'No author data was used: the latest message is outside support scope or unclear.' : 'No database facts are needed for this reply.'}</p>}
        {ctx?.facts && (
          <div className="space-y-3 text-sm">
            {ctx.facts.books.map((b, i) => (
              <div key={`${b.title}-${i}`}>
                <p className="font-medium">{b.title}{ctx.books[i]?.bookCode ? <span className="ml-1 text-xs font-normal text-slate-500">({ctx.books[i]!.bookCode})</span> : null}</p>
                <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
                  {b.fields.map((f) => (<div key={f.key} className="contents"><dt className="text-slate-500">{f.label}</dt><dd className="break-words">{f.value}</dd></div>))}
                </dl>
                {b.notes.map((n) => <p key={n} className="mt-1 text-xs text-slate-600">{n}</p>)}
              </div>
            ))}
            {ctx.facts.payout && (
              <p className="text-xs text-slate-600">Payout schedule: last quarter ended {ctx.facts.payout.quarterEnd}; policy deadline {ctx.facts.payout.deadline} ({ctx.facts.payout.deadlinePassed ? 'passed' : 'not yet passed'}).</p>
            )}
          </div>
        )}
        {ctx && <p className="mt-2 text-xs text-slate-500">{fromDraft ? 'These are the facts supplied for the draft shown.' : 'Current facts. No draft has been generated from them yet.'} Only fields relevant to this question are shown.</p>}
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50/40 p-4" aria-labelledby="ctx-kb">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="ctx-kb" className="text-sm font-semibold text-slate-700">Knowledge-base references</h2>
          <Tag tone="indigo">Source: Knowledge Base</Tag>
        </div>
        {!ctx && <p className="text-sm text-slate-500">{loading ? 'Loading context…' : 'Not available yet.'}</p>}
        {ctx?.kb.status === 'NONE_FOUND' && <p className="rounded bg-amber-50 px-2 py-1.5 text-sm text-amber-900">No supporting document found. {ctx.kb.note}</p>}
        {ctx?.kb.status === 'NOT_REQUIRED' && <p className="text-sm text-slate-600">{ctx.kb.note}</p>}
        <ul className="space-y-3">
          {ctx?.kb.references.map((r) => (
            <li key={r.docId} className="rounded-md border border-sky-100 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-slate-500">Section: {r.heading} · doc {r.slug} v{r.version}</p>
              </div>
              <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Why selected:</span> {r.reason}</p>
              <ul className="mt-2 space-y-1">
                {r.excerpts.map((e) => <li key={e.entry} className="border-l-2 border-sky-300 pl-2 text-slate-700">{e.text}<span className="ml-1 text-xs text-slate-500">(entry {e.entry} of {r.totalEntries}{e.matched ? '' : ', opening entry: no keyword match'})</span></li>)}
              </ul>
              <p className="mt-1 text-xs text-slate-500">The full document was supplied to the AI; excerpts are the entries closest to the author&apos;s question.</p>
            </li>
          ))}
        </ul>
      </section>

      <Card title="Draft check">
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Tag tone={tone[v.level]}>{v.label}</Tag></div>
          <p className="text-slate-600">{v.detail}</p>
          {v.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900">{v.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {ctx?.route === 'HYBRID' && ctx.facts && ctx.kb.references.length === 0 && <p className="text-xs text-amber-800">This reply needs both sources but one is missing. Check it carefully.</p>}
          <p className="text-xs text-slate-500">{CHECKS_SCOPE}</p>
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>;
}
