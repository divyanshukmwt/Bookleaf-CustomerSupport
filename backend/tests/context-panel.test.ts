// Tests for the admin context panel data: DB facts adapted to the question, and the knowledge-base
// references that were actually supplied to the draft step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildFacts } from '../src/modules/ai/logic/facts';
import { buildContextSnapshot, buildKbReferences, kbEntries, type KbDocInput } from '../src/modules/ai/logic/contextSnapshot';
import { kbSlugsFor, routeFor } from '../src/modules/ai/logic/routing';
import type { BookFacts } from '../src/modules/ai/logic/types';
import { KB_DOCUMENTS } from '../src/modules/knowledge/kb.content';

const data = JSON.parse(readFileSync(path.join(__dirname, '../prisma/data/bookleaf_sample_data.json'), 'utf8'));
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const book = (id: string): BookFacts => {
  const b = data.authors.flatMap((a: any) => a.books).find((x: any) => x.book_id === id);
  return {
    bookCode: id, title: b.title, isbn: b.isbn, status: b.status, publicationDate: toDate(b.publication_date), mrp: b.mrp,
    authorRoyaltyPerCopy: b.author_royalty_per_copy, totalCopiesSold: b.total_copies_sold,
    totalRoyaltyEarned: b.total_royalty_earned, royaltyPaid: b.royalty_paid, royaltyPending: b.royalty_pending,
    lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date), printPartner: b.print_partner, availableOn: b.available_on,
  };
};
const NOW = new Date('2026-10-08T10:00:00Z');
const docs = (slugs: string[]): KbDocInput[] =>
  slugs.map((slug, i) => {
    const d = KB_DOCUMENTS.find((k) => k.slug === slug)!;
    return { id: `doc-${slug}`, slug, title: d.title, version: 1 + i, content: d.content };
  });

function snapshotFor(opts: { intent: any; category: any; books: BookFacts[]; query: string; scope?: string }) {
  const route = routeFor(opts.intent, opts.books.length);
  const kbExpected = route === 'KB_ONLY' || route === 'HYBRID';
  const facts = route === 'DB_ONLY' || route === 'HYBRID' ? buildFacts(opts.intent, opts.books, 'Priya', NOW) : null;
  const kbDocs = kbExpected ? docs(kbSlugsFor(opts.category ?? 'GENERAL_INQUIRY', opts.intent)) : [];
  return buildContextSnapshot({ scope: opts.scope ?? 'IN_SCOPE', intent: opts.intent, category: opts.category, route, books: opts.books, facts, kbDocs, kbVersion: 'v', kbExpected, query: opts.query });
}

test('hybrid royalty ticket shows BOTH database facts and the royalty-policy reference', () => {
  const s = snapshotFor({ intent: 'ROYALTY_STATUS', category: 'ROYALTY_PAYMENTS', books: [book('BK016')], query: 'Why is my pending royalty not paid yet?' });
  assert.equal(s.route, 'HYBRID');
  assert.ok(s.facts);
  assert.equal(s.facts!.books[0]!.title, book('BK016').title);
  assert.equal(s.kb.status, 'SUPPLIED');
  assert.deepEqual(s.kb.references.map((r) => r.slug), ['royalty-policy']);
  assert.equal(s.books[0]!.bookCode, 'BK016');
});

test('KB references are exactly the documents the routing supplied: none invented, none omitted', () => {
  for (const [category, intent] of [['ROYALTY_PAYMENTS', 'ROYALTY_STATUS'], ['ISBN_METADATA', 'METADATA_UPDATE'], ['GENERAL_INQUIRY', 'POLICY_QUESTION'], ['PRINTING_QUALITY', 'POLICY_QUESTION']] as const) {
    const s = snapshotFor({ intent, category, books: [book('BK001')], query: 'general question' });
    assert.deepEqual(s.kb.references.map((r) => r.slug), kbSlugsFor(category, intent), `${category}/${intent}`);
    for (const r of s.kb.references) assert.equal(r.fullDocumentSupplied, true);
  }
});

test('excerpts are real KB entries chosen by overlap with the author question', () => {
  const [ref] = buildKbReferences(docs(['royalty-policy']), { category: 'ROYALTY_PAYMENTS', intent: 'ROYALTY_STATUS', query: 'What is the minimum payout threshold for royalties?' });
  assert.ok(ref!.excerpts.length >= 1 && ref!.excerpts.length <= 3);
  assert.ok(ref!.excerpts.every((e) => e.matched));
  const all = kbEntries(KB_DOCUMENTS.find((k) => k.slug === 'royalty-policy')!.content);
  for (const e of ref!.excerpts) assert.equal(all[e.entry - 1], e.text); // verbatim, addressable by entry number
  assert.ok(ref!.excerpts.some((e) => /minimum payout threshold/i.test(e.text)));
  assert.equal(ref!.totalEntries, all.length);
  assert.match(ref!.reason, /Royalty & Payments/);
  assert.equal(ref!.docId, 'doc-royalty-policy');
});

test('when no entry matches, excerpts are flagged unmatched rather than passed off as a citation', () => {
  const [ref] = buildKbReferences(docs(['company-overview']), { category: 'GENERAL_INQUIRY', intent: 'POLICY_QUESTION', query: 'zzz qqq' });
  assert.ok(ref!.excerpts.length > 0);
  assert.ok(ref!.excerpts.every((e) => e.matched === false));
});

test('DB-only sales reply: facts shown, KB explicitly not used', () => {
  const s = snapshotFor({ intent: 'SALES_FIGURES', category: 'ROYALTY_PAYMENTS', books: [book('BK001')], query: 'How many copies sold?' });
  assert.equal(s.route, 'DB_ONLY');
  assert.ok(s.facts);
  assert.equal(s.kb.status, 'NOT_REQUIRED');
  assert.equal(s.kb.references.length, 0);
  assert.match(s.kb.note!, /database facts only/);
});

test('KB needed but nothing found: explicit "no supporting document" state, no fabricated reference', () => {
  const s = buildContextSnapshot({ scope: 'IN_SCOPE', intent: 'POLICY_QUESTION', category: 'GENERAL_INQUIRY', route: 'INSUFFICIENT_INFORMATION', books: [], facts: null, kbDocs: [], kbVersion: 'none', kbExpected: true, query: 'q' });
  assert.equal(s.kb.status, 'NONE_FOUND');
  assert.deepEqual(s.kb.references, []);
  assert.match(s.kb.note!, /No supporting knowledge-base document was found/);
});

test('facts adapt to the question: production status never carries royalty or payment figures', () => {
  const s = snapshotFor({ intent: 'PRODUCTION_STATUS', category: 'PRODUCTION_UPDATES', books: [book('BK013')], query: 'Where is my book?' });
  const keys = s.facts!.books[0]!.fields.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['publicationDate', 'status']);
  assert.equal(s.facts!.payout, null);
  assert.doesNotMatch(JSON.stringify(s), /royalt(y|ies) (paid|pending|earned)|₹/i);
});

test('royalty facts include payout schedule; ISBN question includes the ISBN but no money', () => {
  const r = snapshotFor({ intent: 'ROYALTY_STATUS', category: 'ROYALTY_PAYMENTS', books: [book('BK001')], query: 'royalty' });
  assert.ok(r.facts!.payout);
  const i = snapshotFor({ intent: 'ISBN_ISSUE', category: 'ISBN_METADATA', books: [book('BK001')], query: 'isbn wrong' });
  assert.ok(i.facts!.books[0]!.fields.some((f) => f.key === 'isbn'));
  assert.ok(!i.facts!.books[0]!.fields.some((f) => /royalty|mrp/i.test(f.key)));
});

test('privacy: out-of-scope snapshot has no author facts, books or KB documents', () => {
  const s = buildContextSnapshot({ scope: 'OUT_OF_SCOPE', intent: 'OTHER', category: null, route: 'INSUFFICIENT_INFORMATION', books: [], facts: null, kbDocs: [], kbVersion: 'none', kbExpected: false, query: '' });
  assert.equal(s.facts, null);
  assert.deepEqual(s.books, []);
  assert.deepEqual(s.kb.references, []);
  assert.doesNotMatch(JSON.stringify(s), /Priya|BK0|isbn|₹/i);
});

test('snapshot never carries contact or banking fields', () => {
  const s = snapshotFor({ intent: 'ROYALTY_STATUS', category: 'ROYALTY_PAYMENTS', books: [book('BK001')], query: 'royalty' });
  assert.doesNotMatch(JSON.stringify(s), /email|phone|bank|ifsc|account_?number|password|@/i);
});

test('the admin-only book code is never part of a per-intent field list, so it cannot reach the AI prompt', () => {
  const src = readFileSync(path.join(__dirname, '../src/modules/ai/logic/facts.ts'), 'utf8');
  const withoutLabel = src.replace(/\n\s*bookCode: 'Book code'[^\n]*/, '');
  assert.doesNotMatch(withoutLabel, /bookCode/);
});
