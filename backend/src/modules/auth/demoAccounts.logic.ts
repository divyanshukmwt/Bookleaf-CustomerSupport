// Pure rules for the evaluation quick-login (no env, no database, so they can be unit tested).
// The demo accounts are the ones created by prisma/seed.ts; this file only decides WHICH of them are
// advertised and whether the feature may run at all. It never invents an account or a password.

export interface DemoLoginConfig {
  DEMO_LOGIN: 'true' | 'false';
  DEMO_LOGIN_ALLOW_PRODUCTION: 'true' | 'false';
  NODE_ENV: 'development' | 'test' | 'production';
  SEED_AUTHOR_PASSWORD?: string | undefined;
  SEED_ADMIN_PASSWORD?: string | undefined;
}

export interface DemoLoginDecision { enabled: boolean; problems: string[] }

/**
 * Off unless DEMO_LOGIN=true. Containers run with NODE_ENV=production, so an evaluation deployment
 * must ALSO set DEMO_LOGIN_ALLOW_PRODUCTION=true; without it the process refuses to start rather than
 * quietly publishing credentials. Seed passwords must be real values, never the .env.example placeholders.
 */
export function decideDemoLogin(c: DemoLoginConfig): DemoLoginDecision {
  if (c.DEMO_LOGIN !== 'true') return { enabled: false, problems: [] };
  const problems: string[] = [];
  if (c.NODE_ENV === 'production' && c.DEMO_LOGIN_ALLOW_PRODUCTION !== 'true') {
    problems.push('DEMO_LOGIN=true in production also needs DEMO_LOGIN_ALLOW_PRODUCTION=true (it publishes the seeded demo credentials on the login page)');
  }
  for (const key of ['SEED_AUTHOR_PASSWORD', 'SEED_ADMIN_PASSWORD'] as const) {
    const v = c[key];
    if (!v) problems.push(`${key} must be set when DEMO_LOGIN=true`);
    else if (v.startsWith('replace-with')) problems.push(`${key} is still the .env.example placeholder`);
  }
  return { enabled: problems.length === 0, problems };
}

export interface DemoAccountSpec {
  email: string;
  role: 'AUTHOR' | 'ADMIN';
  /** What an evaluator should try with this account (static guidance, no data). */
  tryThis: string;
}

export interface DemoUserRow {
  email: string;
  name: string;
  role: 'AUTHOR' | 'ADMIN';
  isActive: boolean;
  passwordHash: string;
  author: { authorCode: string; city: string | null; books: { title: string }[] } | null;
}

export interface DemoAccount { email: string; name: string; role: 'AUTHOR' | 'ADMIN'; description: string; password: string }

/** Describes an account from what the database actually holds. */
export function describeAccount(spec: DemoAccountSpec, u: DemoUserRow): string {
  if (u.role === 'ADMIN' || !u.author) return spec.tryThis;
  const n = u.author.books.length;
  const titles = u.author.books.map((b) => b.title).join(', ');
  const where = u.author.city ? ` from ${u.author.city}` : '';
  return `${u.author.authorCode}${where}, ${n} book${n === 1 ? '' : 's'} (${titles}). ${spec.tryThis}`;
}

/**
 * Keeps only accounts that exist, are active and whose seeded password really verifies, in the order
 * of `specs`. `verify` compares a candidate password with the stored hash (bcrypt in production).
 */
export async function resolveDemoAccounts(
  specs: DemoAccountSpec[],
  users: DemoUserRow[],
  passwordFor: (role: 'AUTHOR' | 'ADMIN') => string | undefined,
  verify: (password: string, hash: string) => Promise<boolean>,
): Promise<DemoAccount[]> {
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const out: DemoAccount[] = [];
  for (const spec of specs) {
    const u = byEmail.get(spec.email.toLowerCase());
    const password = passwordFor(spec.role);
    if (!u || !u.isActive || u.role !== spec.role || !password) continue;
    if (!(await verify(password, u.passwordHash))) continue;
    out.push({ email: u.email, name: u.name, role: u.role, description: describeAccount(spec, u), password });
  }
  return out;
}

// The accounts worth showing, taken from the seed (dataset authors and the two seeded admins).
export const DEMO_ACCOUNT_SPECS: DemoAccountSpec[] = [
  { email: 'priya.sharma@email.com', role: 'AUTHOR', tryThis: 'Start here: open a book and use "Ask a question about this book", then follow the reply in real time.' },
  { email: 'rohit.kapoor@email.com', role: 'AUTHOR', tryThis: 'A second author: confirm you see only your own books and tickets, never Priya\'s.' },
  { email: 'sneha.kulkarni@email.com', role: 'AUTHOR', tryThis: 'The author with the most books: try royalty and production questions across several titles.' },
  { email: 'admin@bookleaf.example', role: 'ADMIN', tryThis: 'Ticket queue with filters, AI classification, AI draft replies with the facts and knowledge-base context beside them, overrides, internal notes, and the AI Metrics page.' },
  { email: 'ops@bookleaf.example', role: 'ADMIN', tryThis: 'A second staff account with the same ADMIN role (there is no separate operations role): use it to check ticket assignment and that internal notes stay hidden from authors.' },
];
