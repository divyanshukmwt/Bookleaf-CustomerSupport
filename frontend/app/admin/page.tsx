'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, inputClass, PageLoader, PriorityBadge, StatusBadge, Tag, UnreadBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { useSocketEvent } from '@/lib/auth';
import { ageHours, ageLabel, CATEGORY_LABEL, PRIORITY_LABEL } from '@/lib/format';
import type { AdminTicketSummary } from '@/lib/types';

const TABS = [
  { key: 'active', label: 'Active', status: 'OPEN,IN_PROGRESS' },
  { key: 'resolved', label: 'Resolved', status: 'RESOLVED' },
  { key: 'closed', label: 'Closed', status: 'CLOSED' },
  { key: 'all', label: 'All', status: '' },
];
const OVERDUE_HOURS = 48;

interface Page { items: AdminTicketSummary[]; total: number; page: number; pageSize: number }

export default function AdminQueuePage() {
  const [tab, setTab] = useState('active');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('urgency');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ sort, page: String(page), pageSize: '25' });
    const status = TABS.find((t) => t.key === tab)?.status;
    if (status) p.set('status', status);
    if (category) p.set('category', category);
    if (priority) p.set('priority', priority);
    if (assignee) p.set('assignee', assignee);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (search) p.set('search', search);
    api<Page>(`/admin/tickets?${p}`).then((r) => { setData(r); setError(null); }).catch((e) => setError(errorMessage(e)));
  }, [tab, category, priority, assignee, from, to, sort, search, page]);
  useEffect(load, [load]);

  // New tickets, AI classification results and replies refresh the queue live.
  useSocketEvent('ticket:created', load);
  useSocketEvent('ticket:updated', load);
  useSocketEvent('ticket:message', load);
  useSocketEvent('ticket:read', load);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ticket Queue</h1>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => reset(setTab)(t.key)} className={`rounded-md px-3 py-1.5 text-sm ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{t.label}</button>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className={inputClass} placeholder="Search subject, author or #" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search" />
          <select className={inputClass} value={category} onChange={(e) => reset(setCategory)(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={inputClass} value={priority} onChange={(e) => reset(setPriority)(e.target.value)} aria-label="Priority">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={inputClass} value={assignee} onChange={(e) => reset(setAssignee)(e.target.value)} aria-label="Assignee">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <label className="text-xs text-slate-500">From<input type="date" className={inputClass} value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
          <label className="text-xs text-slate-500">To<input type="date" className={inputClass} value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Sort
            <select className={inputClass} value={sort} onChange={(e) => reset(setSort)(e.target.value)}>
              <option value="urgency">Most urgent first</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>
      </Card>

      <ErrorBanner message={error} />
      <ConnectionBanner />
      {!data ? <PageLoader /> : data.items.length === 0 ? (
        <EmptyState title="No tickets match these filters" hint={tab === 'active' ? 'Nothing needs attention right now.' : 'Try widening your filters.'} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Priority</th><th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Author</th>
                <th className="px-3 py-2">Category</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Assignee</th><th className="px-3 py-2">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((t) => {
                const unresolved = t.status === 'OPEN' || t.status === 'IN_PROGRESS';
                const overdue = unresolved && ageHours(t.createdAt) > OVERDUE_HOURS;
                const edge = t.priority === 'CRITICAL' ? 'border-l-4 border-l-red-600' : t.priority === 'HIGH' ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-transparent';
                return (
                  <tr key={t.id} className={`hover:bg-slate-50 ${edge}`}>
                    <td className="px-3 py-2"><PriorityBadge priority={t.priority} />{t.priorityOverridden && <span className="ml-1 text-[10px] text-slate-500">edited</span>}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/tickets/${t.id}`} className={`${t.unreadCount > 0 ? 'font-semibold' : 'font-medium'} text-brand-700 hover:underline`}>#{t.ticketNumber} · {t.subject}</Link>
                      {t.unreadCount > 0 && <span className="ml-2 align-middle"><UnreadBadge count={t.unreadCount} label="unread messages" /></span>}
                      <div className="text-xs text-slate-500">{t.book ? t.book.title : 'General / Account Level'}</div>
                    </td>
                    <td className="px-3 py-2">{t.author.user.name}</td>
                    <td className="px-3 py-2">
                      {t.category ? CATEGORY_LABEL[t.category] : <span className="text-slate-500">Unclassified</span>}
                      {t.aiStatus === 'FAILED' && <div><Tag tone="red">AI failed</Tag></div>}
                      {(t.aiStatus === 'PENDING' || t.aiStatus === 'PROCESSING') && <div><Tag tone="indigo">Classifying…</Tag></div>}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-2">{t.assignedTo?.name ?? <span className="text-slate-500">Unassigned</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ageLabel(t.createdAt)}{overdue && <span className="ml-1"><Tag tone="red">Overdue</Tag></span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{data.total} tickets</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>Page {page} of {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
