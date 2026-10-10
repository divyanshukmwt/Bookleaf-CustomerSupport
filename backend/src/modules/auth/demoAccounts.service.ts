import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { DEMO_ACCOUNT_SPECS, resolveDemoAccounts, type DemoAccount } from './demoAccounts.logic';

// Evaluation quick-login: lists the seeded demo accounts so the login page can pre-fill them.
// Only reachable when DEMO_LOGIN=true (see env.ts); the route answers 404 otherwise.
// Each account is advertised only if its seeded password verifies against the stored hash, so the page
// never shows a credential that would not work. Verification is cached briefly (bcrypt is slow on purpose).
const TTL_MS = 60_000;
let cache: { at: number; accounts: DemoAccount[] } | null = null;

export async function listDemoAccounts(): Promise<DemoAccount[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.accounts;
  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_ACCOUNT_SPECS.map((s) => s.email) } },
    select: {
      email: true, name: true, role: true, isActive: true, passwordHash: true,
      author: { select: { authorCode: true, city: true, books: { orderBy: { bookCode: 'asc' }, select: { title: true } } } },
    },
  });
  const accounts = await resolveDemoAccounts(
    DEMO_ACCOUNT_SPECS,
    users,
    (role) => (role === 'ADMIN' ? env.SEED_ADMIN_PASSWORD : env.SEED_AUTHOR_PASSWORD),
    (password, hash) => bcrypt.compare(password, hash),
  );
  cache = { at: Date.now(), accounts };
  return accounts;
}
