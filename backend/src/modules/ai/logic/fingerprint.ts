import { createHash } from 'node:crypto';
import type { Scope } from './topic';
import type { Category, Intent, Route } from './types';

// Hash of everything that decides WHAT a draft is built from: the DB facts plus the effective
// category, intent, route and scope decision. Part of the draft cache key, so a change in any of them (e.g. a stale
// SALES_FIGURES intent upgraded to ROYALTY_STATUS, or an admin category override) cannot reuse a
// draft built for another intent even when the extracted facts happen to be identical.
export function contextFingerprint(input: { facts: unknown; category: Category | null; intent: Intent; route: Route; scope?: Scope }): string {
  const { facts, category, intent, route, scope = 'IN_SCOPE' } = input;
  return createHash('sha256').update(JSON.stringify({ facts, category, intent, route, scope })).digest('hex').slice(0, 16);
}
