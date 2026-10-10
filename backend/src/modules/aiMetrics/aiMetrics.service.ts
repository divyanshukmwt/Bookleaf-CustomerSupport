import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { aggregateRuns, ERROR_KIND_LABEL, publicProviders, rangeStart, sanitizeLogText, type AiErrorKind, type RunGroup } from '../ai/logic/aiMetrics';
import type { MetricsQuery, RunsQuery } from './aiMetrics.schemas';

function runWhere(q: MetricsQuery, now: Date): Prisma.AiRunWhereInput {
  const since = rangeStart(q.range, now);
  return {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(q.provider ? { provider: q.provider } : {}),
    ...(q.operation ? { operation: q.operation } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
}

// Only names and models are ever exposed (publicProviders drops everything else, including the key).
const configuredProviders = () => publicProviders(env.aiProviders);

// Three grouped queries in total, regardless of how many runs exist. No polling is needed:
// the page fetches on load, on filter change and on the refresh button.
export async function getMetrics(q: MetricsQuery, now = new Date()) {
  const since = rangeStart(q.range, now);
  const created = since ? { createdAt: { gte: since } } : {};

  const [runGroups, classification, drafts] = await Promise.all([
    prisma.aiRun.groupBy({
      by: ['provider', 'operation', 'status', 'isFallback', 'attempt', 'errorCode', 'retryable'],
      where: runWhere(q, now),
      _count: { _all: true },
      _sum: { latencyMs: true, inputTokens: true, outputTokens: true },
    }),
    prisma.ticket.groupBy({ by: ['aiStatus'], where: created, _count: { _all: true } }),
    prisma.aiDraft.groupBy({ by: ['status', 'source', 'validationStatus'], where: created, _count: { _all: true } }),
  ]);

  const groups: RunGroup[] = runGroups.map((g) => ({
    provider: g.provider,
    operation: g.operation,
    status: g.status,
    isFallback: g.isFallback,
    attempt: g.attempt,
    errorCode: g.errorCode,
    retryable: g.retryable,
    count: g._count._all,
    latencySum: g._sum.latencyMs ?? 0,
    inputTokens: g._sum.inputTokens ?? 0,
    outputTokens: g._sum.outputTokens ?? 0,
  }));
  const metrics = aggregateRuns(groups);

  const sum = (rows: { _count: { _all: number } }[]) => rows.reduce((n, r) => n + r._count._all, 0);
  const cls = (s: string) => sum(classification.filter((r) => r.aiStatus === s));
  const drf = (f: (r: (typeof drafts)[number]) => boolean) => sum(drafts.filter(f));

  return {
    range: q.range,
    since: since?.toISOString() ?? null,
    generatedAt: now.toISOString(),
    filters: { provider: q.provider ?? null, operation: q.operation ?? null, status: q.status ?? null },
    configured: configuredProviders(),
    ...metrics,
    failureReasons: metrics.failureReasons.map((r) => ({ ...r, label: ERROR_KIND_LABEL[r.code as AiErrorKind] ?? 'Unknown error' })),
    // Pipeline outcome tables use the time range only (provider/operation filters apply to calls above).
    classification: { completed: cls('COMPLETED'), failed: cls('FAILED'), processing: cls('PROCESSING'), pending: cls('PENDING') },
    drafts: {
      total: sum(drafts),
      completed: drf((r) => r.status === 'COMPLETED'),
      failed: drf((r) => r.status === 'FAILED'),
      processing: drf((r) => r.status === 'PROCESSING'),
      bySource: { ai: drf((r) => r.source === 'AI'), template: drf((r) => r.source === 'TEMPLATE') },
      byValidation: {
        passed: drf((r) => r.validationStatus === 'PASSED'),
        flagged: drf((r) => r.validationStatus === 'FLAGGED'),
        rejected: drf((r) => r.validationStatus === 'REJECTED'),
      },
    },
    // Cache hits are served without writing anything, so they leave no record. Reporting a number would be invented.
    cache: { recorded: false, note: 'Draft cache hits and misses are not persisted, so no figure is shown. Template drafts above are answered without any AI call.' },
  };
}

export async function listRuns(q: RunsQuery, now = new Date()) {
  const where = runWhere(q, now);
  const [total, rows] = await Promise.all([
    prisma.aiRun.count({ where }),
    prisma.aiRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true, createdAt: true, provider: true, model: true, operation: true, status: true, latencyMs: true, attempt: true,
        isFallback: true, retryable: true, errorCode: true, error: true, promptVersion: true, inputTokens: true, outputTokens: true,
        ticket: { select: { id: true, ticketNumber: true } },
      },
    }),
  ]);
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map(({ error, ticket, ...r }) => ({
      ...r,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      // Sanitised again on the way out: rows written by older code may predate the write-time scrub.
      error: sanitizeLogText(error),
      errorLabel: r.errorCode ? (ERROR_KIND_LABEL[r.errorCode as AiErrorKind] ?? null) : null,
    })),
  };
}
