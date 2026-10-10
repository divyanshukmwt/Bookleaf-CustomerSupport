'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, inputClass, PageLoader, Tag } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { AiMetrics, AiRunsPage } from '@/lib/types';

const RANGES = [['1h', 'Last hour'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']] as const;
const PAGE_SIZE = 15;

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
const ms = (n: number | null) => (n === null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const num = (n: number) => n.toLocaleString('en-IN');

export default function AiMetricsPage() {
  const [range, setRange] = useState('24h');
  const [provider, setProvider] = useState('');
  const [operation, setOperation] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [metrics, setMetrics] = useState<AiMetrics | null>(null);
  const [runs, setRuns] = useState<AiRunsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0); // ignore responses from superseded requests

  const query = useCallback((extra = '') => {
    const p = new URLSearchParams({ range });
    if (provider) p.set('provider', provider);
    if (operation) p.set('operation', operation);
    if (status) p.set('status', status);
    return `${p.toString()}${extra}`;
  }, [range, provider, operation, status]);

  // Fetched on load, on filter or page change, and on the Refresh button. There is deliberately no timer.
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [m, r] = await Promise.all([
        api<AiMetrics>(`/admin/ai/metrics?${query()}`),
        api<AiRunsPage>(`/admin/ai/runs?${query(`&page=${page}&pageSize=${PAGE_SIZE}`)}`),
      ]);
      if (mine !== seq.current) return;
      setMetrics(m);
      setRuns(r);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [query, page]);
  useEffect(() => { void load(); }, [load]);

  const changeFilter = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { set(e.target.value); setPage(1); };

  const t = metrics?.totals;
  const empty = metrics && t?.runs === 0;
  const lastPage = runs ? Math.max(1, Math.ceil(runs.total / runs.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">AI metrics</h1>
          <p className="text-sm text-slate-500">Calculated from the stored AI call log. Each provider call counts once, including retries and fallbacks.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} loading={loading && !!metrics}>Refresh</Button>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <Filter label="Time range" value={range} onChange={changeFilter(setRange)} options={RANGES.map(([v, l]) => [v, l])} />
          <Filter label="Provider" value={provider} onChange={changeFilter(setProvider)} options={[['', 'All providers'], ['gemini', 'Gemini'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic']]} />
          <Filter label="Operation" value={operation} onChange={changeFilter(setOperation)} options={[['', 'All operations'], ['CLASSIFICATION', 'Classification'], ['DRAFT', 'Draft'], ['SUMMARY', 'Summary']]} />
          <Filter label="Status" value={status} onChange={changeFilter(setStatus)} options={[['', 'All statuses'], ['SUCCESS', 'Success'], ['FAILED', 'Failed']]} />
        </div>
      </Card>

      <ErrorBanner message={error} />
      {loading && !metrics && !error && <PageLoader />}
      {error && !metrics && <Button variant="secondary" onClick={() => void load()}>Try again</Button>}

      {metrics && t && (
        <>
          <section aria-label="Summary" className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 ${loading ? 'opacity-60' : ''}`}>
            <Stat label="Total AI calls" value={num(t.runs)} />
            <Stat label="Successful" value={num(t.success)} sub={pct(t.successRate)} tone="green" />
            <Stat label="Failed" value={num(t.failed)} sub={pct(t.failureRate)} tone={t.failed > 0 ? 'red' : undefined} />
            <Stat label="Avg latency" value={ms(t.avgLatencyMs)} />
            <Stat label="Retries" value={num(t.retries)} sub="same-provider, after malformed output" />
            <Stat label="Fallback calls" value={num(t.fallbackRuns)} sub="made on the backup provider" tone={t.fallbackRuns > 0 ? 'amber' : undefined} />
          </section>

          <Card title="Configured providers">
            {metrics.configured.length === 0 ? (
              <p className="text-sm text-amber-800">No AI provider is configured. Classification and drafting are unavailable; tickets still work and replies are written manually.</p>
            ) : (
              <ul className="flex flex-wrap gap-2 text-sm">
                {metrics.configured.map((c) => <li key={c.provider}><Tag tone={c.role === 'primary' ? 'indigo' : 'slate'}>{c.role === 'primary' ? 'Primary' : 'Fallback'}: {c.provider} · {c.model}</Tag></li>)}
              </ul>
            )}
          </Card>

          {empty ? (
            <EmptyState title="No AI calls in this selection" hint="Try a longer time range or clear the filters. Calls appear here once a ticket is classified or a draft is generated." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Provider usage">
                <Table head={['Provider', 'Calls', 'Failed', 'Success', 'Avg latency', 'Fallback', 'Retries']} rows={metrics.byProvider.map((p) => [p.provider, num(p.runs), num(p.failed), pct(p.successRate), ms(p.avgLatencyMs), num(p.fallbackRuns), num(p.retries)])} />
              </Card>
              <Card title="By operation">
                <Table head={['Operation', 'Calls', 'Failed', 'Success', 'Avg latency']} rows={metrics.byOperation.map((o) => [o.operation.charAt(0) + o.operation.slice(1).toLowerCase(), num(o.runs), num(o.failed), pct(o.successRate), ms(o.avgLatencyMs)])} />
              </Card>
              <Card title="Failure reasons">
                {metrics.failureReasons.length === 0 ? <p className="text-sm text-slate-500">No failed calls in this selection.</p> : (
                  <Table head={['Reason', 'Count', 'Retryable', 'Providers']} rows={metrics.failureReasons.map((r) => [r.label, num(r.count), r.retryable === null ? 'Unknown' : r.retryable ? 'Yes' : 'No', r.providers.join(', ')])} />
                )}
              </Card>
              <Card title="Tokens">
                <p className="text-sm text-slate-600">Input {num(t.inputTokens)} · Output {num(t.outputTokens)}</p>
                <p className="mt-1 text-xs text-slate-500">As reported by the providers; calls that failed before a response report none.</p>
              </Card>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Classification outcomes">
              <p className="mb-2 text-xs text-slate-500">Tickets created in this time range, by classification state.</p>
              <Table head={['Completed', 'Failed', 'Processing', 'Queued']} rows={[[num(metrics.classification.completed), num(metrics.classification.failed), num(metrics.classification.processing), num(metrics.classification.pending)]]} />
            </Card>
            <Card title="Draft outcomes">
              <p className="mb-2 text-xs text-slate-500">Drafts created in this time range.</p>
              <Table head={['Completed', 'Failed', 'AI-written', 'Template (no AI)']} rows={[[num(metrics.drafts.completed), num(metrics.drafts.failed), num(metrics.drafts.bySource.ai), num(metrics.drafts.bySource.template)]]} />
              <p className="mt-2 text-xs text-slate-600">Automated checks: {num(metrics.drafts.byValidation.passed)} passed · {num(metrics.drafts.byValidation.flagged)} flagged for review · {num(metrics.drafts.byValidation.rejected)} withheld.</p>
            </Card>
          </div>

          <Card title="Draft cache"><p className="text-sm text-slate-600">{metrics.cache.note}</p></Card>

          <Card title="Recent AI calls">
            {!runs || runs.items.length === 0 ? (
              <p className="text-sm text-slate-500">No calls to show.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>{['Time', 'Ticket', 'Provider', 'Operation', 'Status', 'Latency', 'Details'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runs.items.map((r) => (
                        <tr key={r.id} className="align-top">
                          <td className="whitespace-nowrap px-2 py-1.5">{fmtDateTime(r.createdAt)}</td>
                          <td className="px-2 py-1.5"><Link className="text-brand-700 hover:underline" href={`/admin/tickets/${r.ticketId}`}>#{r.ticketNumber}</Link></td>
                          <td className="px-2 py-1.5">{r.provider}<span className="block text-xs text-slate-500">{r.model}</span></td>
                          <td className="px-2 py-1.5">{r.operation.toLowerCase()}</td>
                          <td className="px-2 py-1.5"><Tag tone={r.status === 'SUCCESS' ? 'green' : 'red'}>{r.status === 'SUCCESS' ? 'Success' : 'Failed'}</Tag></td>
                          <td className="whitespace-nowrap px-2 py-1.5">{ms(r.latencyMs)}</td>
                          <td className="px-2 py-1.5 text-xs text-slate-600">
                            {r.attempt > 1 && <Tag tone="amber">retry</Tag>} {r.isFallback && <Tag tone="amber">fallback</Tag>}
                            {r.status === 'FAILED' && (
                              <span className="block">{r.errorLabel ?? 'Error'}{r.retryable !== null ? ` · ${r.retryable ? 'retryable' : 'not retryable'}` : ''}{r.error ? <span className="block break-words text-slate-500">{r.error}</span> : null}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{num(runs.total)} calls · page {runs.page} of {lastPage}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            )}
          </Card>
          <p className="text-xs text-slate-500">Updated {fmtDateTime(metrics.generatedAt)}. Error text is scrubbed of keys, tokens, cookies and email addresses before it is stored or shown.</p>
        </>
      )}
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <select className={inputClass} value={value} onChange={onChange}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
