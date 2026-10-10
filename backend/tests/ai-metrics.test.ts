import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { aggregateRuns, errorKindFor, publicProviders, rangeStart, sanitizeLogText, type RunGroup } from '../src/modules/ai/logic/aiMetrics';
import { metricsQuery, runsQuery } from '../src/modules/aiMetrics/aiMetrics.schemas';

const g = (o: Partial<RunGroup>): RunGroup => ({ provider: 'gemini', operation: 'DRAFT', status: 'SUCCESS', isFallback: false, attempt: 1, errorCode: null, retryable: null, count: 1, latencySum: 1000, inputTokens: 100, outputTokens: 50, ...o });

test('aggregation: totals, rates, latency, tokens', () => {
  const m = aggregateRuns([g({ count: 8, latencySum: 8000 }), g({ status: 'FAILED', errorCode: 'TIMEOUT', retryable: true, count: 2, latencySum: 20000, inputTokens: 0, outputTokens: 0 })]);
  assert.equal(m.totals.runs, 10);
  assert.equal(m.totals.success, 8);
  assert.equal(m.totals.failed, 2);
  assert.equal(m.totals.successRate, 80);
  assert.equal(m.totals.failureRate, 20);
  assert.equal(m.totals.avgLatencyMs, 2800); // (8000 + 20000) / 10
  assert.equal(m.totals.inputTokens, 100); // group fields are already sums (from SQL SUM)
});

test('aggregation: empty data yields nulls, not NaN or invented zeros for rates', () => {
  const m = aggregateRuns([]);
  assert.equal(m.totals.runs, 0);
  assert.equal(m.totals.successRate, null);
  assert.equal(m.totals.failureRate, null);
  assert.equal(m.totals.avgLatencyMs, null);
  assert.deepEqual(m.byProvider, []);
  assert.deepEqual(m.failureReasons, []);
});

test('aggregation: provider usage, fallback and retry counts', () => {
  const m = aggregateRuns([
    g({ provider: 'gemini', status: 'FAILED', errorCode: 'RATE_LIMITED', retryable: true, count: 3 }),
    g({ provider: 'openai', isFallback: true, count: 3 }),
    g({ provider: 'gemini', status: 'FAILED', attempt: 1, errorCode: 'MALFORMED_OUTPUT', retryable: true, count: 1 }),
    g({ provider: 'gemini', attempt: 2, count: 1 }),
  ]);
  const gem = m.byProvider.find((p) => p.provider === 'gemini')!;
  const oai = m.byProvider.find((p) => p.provider === 'openai')!;
  assert.equal(gem.runs, 5);
  assert.equal(oai.runs, 3);
  assert.equal(oai.fallbackRuns, 3);
  assert.equal(m.totals.fallbackRuns, 3);
  assert.equal(m.totals.retries, 1);
  assert.equal(gem.retries, 1);
});

test('failure reasons: grouped, ranked, mixed retryability reported as unknown', () => {
  const m = aggregateRuns([
    g({ status: 'FAILED', errorCode: 'TIMEOUT', retryable: true, count: 4 }),
    g({ status: 'FAILED', errorCode: 'PROVIDER_4XX', retryable: false, count: 1, provider: 'openai' }),
    g({ status: 'FAILED', errorCode: 'MALFORMED_OUTPUT', retryable: true, count: 1 }),
    g({ status: 'FAILED', errorCode: 'MALFORMED_OUTPUT', retryable: false, count: 1 }),
    g({ status: 'FAILED', errorCode: null, count: 1 }),
  ]);
  assert.deepEqual(m.failureReasons.map((r) => [r.code, r.count]), [['TIMEOUT', 4], ['MALFORMED_OUTPUT', 2], ['PROVIDER_4XX', 1], ['UNKNOWN', 1]]);
  assert.equal(m.failureReasons.find((r) => r.code === 'MALFORMED_OUTPUT')!.retryable, null);
  assert.equal(m.failureReasons.find((r) => r.code === 'PROVIDER_4XX')!.retryable, false);
});

test('error classification from status and safe messages', () => {
  assert.equal(errorKindFor({ message: 'Provider returned HTTP 429', status: 429 }), 'RATE_LIMITED');
  assert.equal(errorKindFor({ message: 'Provider returned HTTP 503', status: 503 }), 'PROVIDER_5XX');
  assert.equal(errorKindFor({ message: 'Provider returned HTTP 401: x', status: 401 }), 'PROVIDER_4XX');
  assert.equal(errorKindFor({ message: 'Provider request timed out' }), 'TIMEOUT');
  assert.equal(errorKindFor({ message: 'Provider network error' }), 'NETWORK');
  assert.equal(errorKindFor({ message: 'Malformed output: bad json' }), 'MALFORMED_OUTPUT');
  assert.equal(errorKindFor({ message: 'Gemini returned an empty response' }), 'EMPTY_RESPONSE');
  assert.equal(errorKindFor({ message: 'weird' }), 'UNKNOWN');
});

test('sanitisation: keys, bearer tokens, JWTs, cookies, emails and long tokens never survive', () => {
  const secrets = [
    'sk-proj-abc123def456ghi789jkl', 'AIzaSyD-abcdefghijklmnopqrstuv', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_part',
    'priya.sharma@example.com', 'a'.repeat(40), 'deadbeef'.repeat(8),
  ];
  const input = `HTTP 401 Incorrect API key provided: ${secrets[0]}. url=https://x/y?key=${secrets[1]} Authorization: Bearer ${secrets[2]} cookie: bookleaf_session=${secrets[2]} contact ${secrets[3]} ${secrets[4]} ${secrets[5]} x-api-key: topsecretvalue`;
  const out = sanitizeLogText(input, 2000)!;
  for (const s of [...secrets, 'topsecretvalue']) assert.ok(!out.includes(s), `leaked: ${s}`);
  assert.match(out, /HTTP 401/); // diagnostic value is preserved
});

test('sanitisation: truncates, tolerates null, keeps ordinary diagnostics', () => {
  assert.equal(sanitizeLogText(null), null);
  assert.equal(sanitizeLogText(''), null);
  assert.equal(sanitizeLogText('Provider request timed out'), 'Provider request timed out');
  assert.ok(sanitizeLogText('word '.repeat(200))!.length <= 201);
});

test('provider listing exposes name, model and role only', () => {
  const out = publicProviders([{ provider: 'gemini', model: 'm1', apiKey: 'SECRET-KEY-VALUE' } as any, { provider: 'openai', model: 'm2', apiKey: 'OTHER-SECRET' } as any]);
  assert.deepEqual(out, [{ provider: 'gemini', model: 'm1', role: 'primary' }, { provider: 'openai', model: 'm2', role: 'fallback' }]);
  assert.ok(!JSON.stringify(out).includes('SECRET'));
});

test('time ranges', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  assert.equal(rangeStart('1h', now)!.toISOString(), '2026-10-11T11:00:00.000Z');
  assert.equal(rangeStart('24h', now)!.toISOString(), '2026-10-10T12:00:00.000Z');
  assert.equal(rangeStart('7d', now)!.toISOString(), '2026-10-04T12:00:00.000Z');
  assert.equal(rangeStart('30d', now)!.toISOString(), '2026-09-11T12:00:00.000Z');
  assert.equal(rangeStart('all', now), null);
});

test('query validation: closed enums, defaults and bounds', () => {
  assert.deepEqual(metricsQuery.parse({}), { range: '24h' });
  assert.ok(metricsQuery.safeParse({ range: '7d', provider: 'openai', operation: 'DRAFT', status: 'FAILED' }).success);
  for (const bad of [{ range: 'forever' }, { provider: "x'; DROP TABLE ai_runs;--" }, { operation: 'DELETE' }, { status: 'MAYBE' }]) assert.equal(metricsQuery.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(runsQuery.parse({}).pageSize, 20);
  assert.equal(runsQuery.safeParse({ pageSize: 5000 }).success, false);
  assert.equal(runsQuery.safeParse({ page: 0 }).success, false);
});

// Static checks: the HTTP server cannot be started in this environment, so authorization wiring and
// secret hygiene are asserted from source. A runtime test is still needed against a running API.
test('static: every AI metrics route sits behind authenticate + requireAdmin', () => {
  const src = readFileSync(path.join(__dirname, '../src/modules/aiMetrics/aiMetrics.routes.ts'), 'utf8');
  const guard = src.indexOf('adminAiRouter.use(authenticate, requireAdmin)');
  assert.ok(guard > -1);
  for (const m of src.matchAll(/adminAiRouter\.(get|post|put|patch|delete)\(/g)) assert.ok(m.index! > guard);
  const routes = readFileSync(path.join(__dirname, '../src/routes.ts'), 'utf8');
  assert.match(routes, /apiRouter\.use\('\/admin\/ai', adminAiRouter\)/);
});

test('static: the metrics service never reads or returns provider keys or cookies', () => {
  const src = readFileSync(path.join(__dirname, '../src/modules/aiMetrics/aiMetrics.service.ts'), 'utf8');
  assert.doesNotMatch(src, /apiKey|API_KEY|cookie|passwordHash/i);
  assert.match(src, /sanitizeLogText\(error\)/);
});

test('static: ai_runs rows are scrubbed before being written', () => {
  const src = readFileSync(path.join(__dirname, '../src/modules/ai/aiService.ts'), 'utf8');
  assert.match(src, /error: sanitizeLogText\(error\)/);
});
