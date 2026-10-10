// Pure helpers for AI observability: error classification, log sanitising, time ranges and
// aggregation. No database, no env: everything here is unit-testable.

export const RANGES = ['1h', '24h', '7d', '30d', 'all'] as const;
export type Range = (typeof RANGES)[number];

const RANGE_MS: Record<Exclude<Range, 'all'>, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
export const rangeStart = (range: Range, now = new Date()): Date | null => (range === 'all' ? null : new Date(now.getTime() - RANGE_MS[range]));

// ---------------------------------------------------------------- error classification

export type AiErrorKind = 'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'PROVIDER_5XX' | 'PROVIDER_4XX' | 'NON_JSON' | 'EMPTY_RESPONSE' | 'MALFORMED_OUTPUT' | 'UNKNOWN';
export const ERROR_KIND_LABEL: Record<AiErrorKind, string> = {
  TIMEOUT: 'Provider timed out',
  NETWORK: 'Network error reaching the provider',
  RATE_LIMITED: 'Provider rate limit (HTTP 429)',
  PROVIDER_5XX: 'Provider server error (HTTP 5xx)',
  PROVIDER_4XX: 'Request rejected by provider (HTTP 4xx: check key, model or request)',
  NON_JSON: 'Provider returned a non-JSON body',
  EMPTY_RESPONSE: 'Provider returned an empty response',
  MALFORMED_OUTPUT: 'Model output failed validation',
  UNKNOWN: 'Unknown error',
};

/** Maps a provider failure to a short stable code. Uses status first, then the (already safe) message. */
export function errorKindFor(input: { message: string; status?: number | null }): AiErrorKind {
  const { message, status } = input;
  if (/^Malformed output/i.test(message)) return 'MALFORMED_OUTPUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408) return 'TIMEOUT';
  if (typeof status === 'number' && status >= 500) return 'PROVIDER_5XX';
  if (typeof status === 'number' && status >= 400) return 'PROVIDER_4XX';
  if (/timed out/i.test(message)) return 'TIMEOUT';
  if (/network error/i.test(message)) return 'NETWORK';
  if (/non-JSON/i.test(message)) return 'NON_JSON';
  if (/empty response/i.test(message)) return 'EMPTY_RESPONSE';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------- sanitising

const REDACTIONS: [RegExp, string][] = [
  [/\bbookleaf_session=[^;\s]+/gi, 'bookleaf_session=[redacted]'],
  [/\b(authorization|x-api-key|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|passwd|cookie|set-cookie)\b\s*["']?\s*[:=]\s*["']?[^\s"',;}]+/gi, '$1=[redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted-key]'],
  [/\bAIza[0-9A-Za-z_-]{10,}/g, '[redacted-key]'],
  [/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"']+/gi, '$1[redacted]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[redacted-token]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]'],
];

export const MAX_LOG_TEXT = 200;

/** Strips anything that looks like a credential, cookie, token or email from provider error text. */
export function sanitizeLogText(text: string | null | undefined, max = MAX_LOG_TEXT): string | null {
  if (!text) return null;
  let out = text.replace(/\s+/g, ' ').trim();
  for (const [re, to] of REDACTIONS) out = out.replace(re, to);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

// ---------------------------------------------------------------- aggregation

export interface RunGroup {
  provider: string;
  operation: string;
  status: 'SUCCESS' | 'FAILED';
  isFallback: boolean;
  attempt: number;
  errorCode: string | null;
  retryable: boolean | null;
  count: number;
  latencySum: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Bucket { runs: number; success: number; failed: number; avgLatencyMs: number | null; successRate: number | null }

const rate = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10); // percent, 1 dp
const avg = (sum: number, n: number) => (n === 0 ? null : Math.round(sum / n));

function bucketOf(groups: RunGroup[]): Bucket {
  let runs = 0, success = 0, failed = 0, lat = 0;
  for (const g of groups) {
    runs += g.count;
    lat += g.latencySum;
    if (g.status === 'SUCCESS') success += g.count;
    else failed += g.count;
  }
  return { runs, success, failed, avgLatencyMs: avg(lat, runs), successRate: rate(success, runs) };
}

function by<T extends string>(groups: RunGroup[], key: (g: RunGroup) => T): Map<T, RunGroup[]> {
  const m = new Map<T, RunGroup[]>();
  for (const g of groups) {
    const k = key(g);
    m.set(k, [...(m.get(k) ?? []), g]);
  }
  return m;
}

export interface RunMetrics {
  totals: Bucket & {
    failureRate: number | null;
    retries: number; // calls that were a same-provider retry after malformed output
    fallbackRuns: number; // calls made on a secondary provider
    inputTokens: number;
    outputTokens: number;
  };
  byProvider: (Bucket & { provider: string; fallbackRuns: number; retries: number })[];
  byOperation: (Bucket & { operation: string })[];
  failureReasons: { code: string; count: number; retryable: boolean | null; providers: string[] }[];
}

export function aggregateRuns(groups: RunGroup[]): RunMetrics {
  const totals = bucketOf(groups);
  const retries = groups.filter((g) => g.attempt > 1).reduce((n, g) => n + g.count, 0);
  const fallbackRuns = groups.filter((g) => g.isFallback).reduce((n, g) => n + g.count, 0);

  const byProvider = [...by(groups, (g) => g.provider)].map(([provider, gs]) => ({
    provider,
    ...bucketOf(gs),
    fallbackRuns: gs.filter((g) => g.isFallback).reduce((n, g) => n + g.count, 0),
    retries: gs.filter((g) => g.attempt > 1).reduce((n, g) => n + g.count, 0),
  })).sort((a, b) => b.runs - a.runs || a.provider.localeCompare(b.provider));

  const byOperation = [...by(groups, (g) => g.operation)].map(([operation, gs]) => ({ operation, ...bucketOf(gs) })).sort((a, b) => a.operation.localeCompare(b.operation));

  const reasons = new Map<string, { count: number; retryable: boolean | null; providers: Set<string> }>();
  for (const g of groups.filter((x) => x.status === 'FAILED')) {
    const code = g.errorCode ?? 'UNKNOWN';
    const r = reasons.get(code) ?? { count: 0, retryable: g.retryable, providers: new Set<string>() };
    r.count += g.count;
    if (r.retryable !== g.retryable) r.retryable = null; // mixed => unknown
    r.providers.add(g.provider);
    reasons.set(code, r);
  }
  const failureReasons = [...reasons].map(([code, r]) => ({ code, count: r.count, retryable: r.retryable, providers: [...r.providers].sort() })).sort((a, b) => b.count - a.count);

  return {
    totals: {
      ...totals,
      failureRate: rate(totals.failed, totals.runs),
      retries,
      fallbackRuns,
      inputTokens: groups.reduce((n, g) => n + g.inputTokens, 0),
      outputTokens: groups.reduce((n, g) => n + g.outputTokens, 0),
    },
    byProvider,
    byOperation,
    failureReasons,
  };
}

/** The only provider information the dashboard may show: name, model and role. Never the key. */
export function publicProviders(configs: { provider: string; model: string }[]): { provider: string; model: string; role: 'primary' | 'fallback' }[] {
  return configs.map((c, i) => ({ provider: c.provider, model: c.model, role: i === 0 ? 'primary' : 'fallback' }));
}
