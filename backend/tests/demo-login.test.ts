import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DEMO_ACCOUNT_SPECS, decideDemoLogin, describeAccount, resolveDemoAccounts, type DemoUserRow } from '../src/modules/auth/demoAccounts.logic';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const base = { DEMO_LOGIN: 'true', DEMO_LOGIN_ALLOW_PRODUCTION: 'false', NODE_ENV: 'development', SEED_AUTHOR_PASSWORD: 'author-pass-1', SEED_ADMIN_PASSWORD: 'admin-pass-1' } as const;

// ---------------------------------------------------------------- gating
test('demo login is off unless explicitly enabled', () => {
  assert.deepEqual(decideDemoLogin({ ...base, DEMO_LOGIN: 'false' }), { enabled: false, problems: [] });
  assert.equal(decideDemoLogin(base).enabled, true);
});

test('in production it needs a second explicit flag, otherwise the API refuses to start', () => {
  const d = decideDemoLogin({ ...base, NODE_ENV: 'production' });
  assert.equal(d.enabled, false);
  assert.match(d.problems.join(' '), /DEMO_LOGIN_ALLOW_PRODUCTION/);
  assert.equal(decideDemoLogin({ ...base, NODE_ENV: 'production', DEMO_LOGIN_ALLOW_PRODUCTION: 'true' }).enabled, true);
});

test('missing or placeholder seed passwords are rejected, never published', () => {
  assert.equal(decideDemoLogin({ ...base, SEED_ADMIN_PASSWORD: undefined }).enabled, false);
  assert.equal(decideDemoLogin({ ...base, SEED_AUTHOR_PASSWORD: 'replace-with-demo-author-password' }).enabled, false);
});

// ---------------------------------------------------------------- which accounts are advertised
const user = (over: Partial<DemoUserRow> & { email: string }): DemoUserRow => ({
  name: 'N', role: 'AUTHOR', isActive: true, passwordHash: 'hash:author-pass-1', author: { authorCode: 'AUTH001', city: 'Mumbai', books: [{ title: 'A' }, { title: 'B' }] }, ...over,
});
const verify = async (pw: string, hash: string) => hash === `hash:${pw}`;
const pw = (role: 'AUTHOR' | 'ADMIN') => (role === 'ADMIN' ? 'admin-pass-1' : 'author-pass-1');

test('only existing, active accounts whose seeded password verifies are advertised', async () => {
  const specs = DEMO_ACCOUNT_SPECS.slice(0, 3);
  const users = [
    user({ email: specs[0]!.email, name: 'Priya' }),
    user({ email: specs[1]!.email, passwordHash: 'hash:changed' }), // password no longer the seeded one
    // specs[2] missing from the database entirely
  ];
  const out = await resolveDemoAccounts(specs, users, pw, verify);
  assert.deepEqual(out.map((a) => a.email), [specs[0]!.email]);
  assert.equal(out[0]!.password, 'author-pass-1');
});

test('inactive accounts and role mismatches are never advertised', async () => {
  const [a, , , admin] = DEMO_ACCOUNT_SPECS;
  const out = await resolveDemoAccounts([a!, admin!], [user({ email: a!.email, isActive: false }), user({ email: admin!.email, role: 'AUTHOR' })], pw, verify);
  assert.deepEqual(out, []);
});

test('admin accounts use the admin seed password, authors the author one', async () => {
  const [a, , , admin] = DEMO_ACCOUNT_SPECS;
  const out = await resolveDemoAccounts([a!, admin!], [user({ email: a!.email }), user({ email: admin!.email, role: 'ADMIN', passwordHash: 'hash:admin-pass-1', author: null })], pw, verify);
  assert.deepEqual(out.map((x) => [x.role, x.password]), [['AUTHOR', 'author-pass-1'], ['ADMIN', 'admin-pass-1']]);
});

test('descriptions come from the stored account: author code, city and real book titles', () => {
  const d = describeAccount(DEMO_ACCOUNT_SPECS[0]!, user({ email: DEMO_ACCOUNT_SPECS[0]!.email }));
  assert.match(d, /AUTH001 from Mumbai, 2 books \(A, B\)/);
});

// ---------------------------------------------------------------- no invented accounts
test('every demo account exists in the seed: dataset authors and the seeded admins', () => {
  const dataset = JSON.parse(read('prisma/data/bookleaf_sample_data.json')) as { authors: { email: string }[] };
  const seed = read('prisma/seed.ts');
  const authorEmails = new Set(dataset.authors.map((a) => a.email.toLowerCase()));
  for (const s of DEMO_ACCOUNT_SPECS) {
    if (s.role === 'AUTHOR') assert.ok(authorEmails.has(s.email.toLowerCase()), `${s.email} is not a seeded author`);
    else assert.ok(seed.includes(`email: '${s.email}'`), `${s.email} is not a seeded admin`);
  }
  assert.ok(DEMO_ACCOUNT_SPECS.some((s) => s.email === 'priya.sharma@email.com'));
});

// ---------------------------------------------------------------- wiring (static; the API is not started here)
test('the endpoint answers 404 when disabled, is rate limited and never cached', () => {
  const routes = read('src/modules/auth/auth.routes.ts');
  assert.match(routes, /if \(!env\.demoLoginEnabled\) throw Errors\.notFound\(\)/);
  assert.match(routes, /demoLimiter/);
  assert.match(routes, /Cache-Control', 'no-store'/);
  assert.match(read('src/config/env.ts'), /decideDemoLogin\(v\)\.problems/);
});

test('the client bundle holds no credentials and demo mode is only a response from the API', () => {
  const files = ['../frontend/lib/demoAccounts.ts', '../frontend/components/DemoAccounts.tsx', '../frontend/app/login/page.tsx'].map(read).join('\n');
  assert.doesNotMatch(files, /password\s*[:=]\s*['"][^'"]{3,}['"]/i);
  assert.doesNotMatch(files, /NEXT_PUBLIC_/);
  assert.match(read('../frontend/lib/demoAccounts.ts'), /\/auth\/demo-accounts/);
});

test('clicking a demo card only fills the form; signing in still uses the normal login', () => {
  const login = read('../frontend/app/login/page.tsx');
  assert.match(login, /onPick=\{\(a\) => \{ setEmail\(a\.email\); setPassword\(a\.password\)/);
  assert.doesNotMatch(read('../frontend/components/DemoAccounts.tsx'), /api\(|login\(/);
});

test('the evaluation note and the env flags are documented, defaulting to off', () => {
  assert.match(read('../frontend/components/DemoAccounts.tsx'), /Use the demo accounts below to explore the author portal, admin dashboard, ticket workflows, and AI-assisted support features/);
  const example = read('.env.example');
  assert.match(example, /^# DEMO_LOGIN=true$/m);
  assert.match(example, /^# DEMO_LOGIN_ALLOW_PRODUCTION=true$/m);
});
