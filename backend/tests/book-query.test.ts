// Regression tests for "Ask a question about this book". Run with NODE_PATH pointing at a zod install
// if backend dependencies are not installed:  tsx --test tests/book-query.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { bookQueryHref, buildTicketPayload, parseBookParam, resolveSelectedBook } from '../../frontend/lib/bookParam';
import { assertAuthorOwnsBook } from '../src/modules/tickets/bookOwnership';
import { createTicketBody } from '../src/modules/tickets/ticket.schemas';
import { isCategoryTrusted, resolveTopic } from '../src/modules/ai/logic/topic';

const B1 = '3f2b6c1e-8a4d-4c55-9a52-1d0a7e5b9c01';
const B2 = '9d1e4a7b-2c3f-4b8e-8f10-5a6b7c8d9e02';
const FOREIGN = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const mine = [{ id: B1 }, { id: B2 }];

test('book link carries the exact book id and round-trips through the param parser', () => {
  const href = bookQueryHref(B1);
  assert.equal(href, `/author/tickets/new?bookId=${B1}`);
  assert.equal(parseBookParam(new URL(href, 'http://x').searchParams.get('bookId')), B1);
});

test('param: valid owned book is preselected; missing means none', () => {
  assert.deepEqual(resolveSelectedBook(B2, mine), { bookId: B2, status: 'ok' });
  assert.deepEqual(resolveSelectedBook(null, mine), { bookId: '', status: 'none' });
});

test('param: malformed, array-injected or foreign ids never select a book', () => {
  for (const bad of ['', 'abc', "'; DROP TABLE books;--", '../../etc/passwd', FOREIGN]) {
    const r = resolveSelectedBook(bad, mine);
    assert.equal(r.bookId, '', bad);
    assert.notEqual(r.status, 'ok');
  }
  assert.equal(resolveSelectedBook([FOREIGN, B1], mine).bookId, '', 'first array item wins and is not owned');
  assert.equal(resolveSelectedBook('abc', mine).status, 'invalid');
});

test('payload preserves the selected book and carries no category', () => {
  const p = buildTicketPayload({ bookId: B1, subject: ' Royalty? ', description: ' Hi ' });
  assert.deepEqual(p, { bookId: B1, subject: 'Royalty?', description: 'Hi' });
  assert.ok(!('category' in p), 'the author never sends a category');
  assert.equal(buildTicketPayload({ bookId: '', subject: 's', description: 'd' }).bookId, null);
});

test('normal general inquiry without a book still works end to end', () => {
  const payload = buildTicketPayload({ bookId: '', subject: 'Question', description: 'How do I change my registered email?' });
  assert.deepEqual(payload, { bookId: null, subject: 'Question', description: 'How do I change my registered email?' });
  assert.ok(createTicketBody.safeParse(payload).success);
});

test('server schema: accepts book + subject + description, rejects bad ids and unknown fields', () => {
  assert.ok(createTicketBody.safeParse({ bookId: B1, subject: 's', description: 'd' }).success);
  const d = createTicketBody.parse({ subject: 's', description: 'd' });
  assert.equal(d.bookId, null);
  assert.equal(createTicketBody.safeParse({ bookId: 'not-a-uuid', subject: 's', description: 'd' }).success, false);
  assert.equal(createTicketBody.safeParse({ bookId: B1, authorId: FOREIGN, subject: 's', description: 'd' }).success, false);
});

test('authors can no longer choose a category: any category in the create payload is rejected', () => {
  assert.equal(createTicketBody.safeParse({ bookId: B1, category: 'ROYALTY_PAYMENTS', subject: 's', description: 'd' }).success, false);
  assert.equal(createTicketBody.safeParse({ category: null, subject: 's', description: 'd' }).success, false);
});

test('static: the form has no category control, the service stores no author category, classification still sets it', () => {
  const form = readFileSync(join(__dirname, '../../frontend/app/author/tickets/new/page.tsx'), 'utf8');
  assert.doesNotMatch(form, /setCategory|id="category"|CATEGORY_OPTIONS|name="category"/);
  const svc = readFileSync(join(__dirname, '../src/modules/tickets/ticket.service.ts'), 'utf8');
  const create = svc.slice(svc.indexOf('export async function createTicket'), svc.indexOf('export async function listAuthorTickets'));
  assert.doesNotMatch(create, /input\.category/);
  const cls = readFileSync(join(__dirname, '../src/modules/ai/classification.service.ts'), 'utf8');
  assert.match(cls, /updateMany\(\{ where: \{ id: ticketId, categoryOverridden: false \}, data: \{ category: value\.category \}/); // AI sets it unless an admin already did
  assert.match(cls, /subject: ticket\.subject,\s*description: ticket\.messages\[0\]\?\.body/); // from subject and description
  assert.match(cls, /NOT_CONFIGURED/); // fallback: with no AI the ticket stays unclassified for manual triage
});

test('admin-side category filter and edit are untouched', () => {
  const schemas = readFileSync(join(__dirname, '../src/modules/tickets/ticket.schemas.ts'), 'utf8');
  assert.match(schemas, /category: csv\(\[/); // queue filter
  assert.match(schemas, /category: z\.enum\(\[[^\]]*\]\)\.optional\(\)/); // admin override
  const svc = readFileSync(join(__dirname, '../src/modules/tickets/ticket.service.ts'), 'utf8');
  assert.match(svc, /data\.categoryOverridden = true/);
});

test('server ownership: own book passes; another author\'s or missing book is a 404', async () => {
  const calls: unknown[] = [];
  const db = { book: { findFirst: async (a: { where: { id: string; authorId: string } }) => { calls.push(a.where); return a.where.authorId === 'A1' && a.where.id === B1 ? { id: B1 } : null; } } };
  await assertAuthorOwnsBook(db, 'A1', B1);
  await assert.rejects(() => assertAuthorOwnsBook(db, 'A2', B1), (e: any) => e.status === 404 && e.code === 'NOT_FOUND');
  await assert.rejects(() => assertAuthorOwnsBook(db, 'A1', FOREIGN), (e: any) => e.status === 404);
  assert.deepEqual(calls[0], { id: B1, authorId: 'A1' }); // scoped by author in the query itself
});

test('legacy rows: a category that was picked by an author (no AI result, not overridden) is still not trusted', () => {
  assert.equal(isCategoryTrusted({ category: 'ROYALTY_PAYMENTS', aiCategory: null, categoryOverridden: false }), false);
  assert.equal(isCategoryTrusted({ category: 'ROYALTY_PAYMENTS', aiCategory: 'ROYALTY_PAYMENTS', categoryOverridden: false }), true);
  assert.equal(isCategoryTrusted({ category: 'ISBN_METADATA', aiCategory: 'ROYALTY_PAYMENTS', categoryOverridden: true }), true);
});

test('privacy: a legacy untrusted Royalty category plus an unrelated question does not unlock author data', () => {
  const r = resolveTopic({
    ticketCategory: 'ROYALTY_PAYMENTS', categoryTrusted: false, ticketIntent: null, isFirstMessage: true,
    subject: 'Quick question', latestAuthorMessage: 'Who is the captain of the Indian cricket team?',
  });
  assert.equal(r.category, null);
  assert.equal(r.scope, 'OUT_OF_SCOPE');
  // while a genuine royalty question with the same hint is answered normally
  const ok = resolveTopic({ ticketCategory: 'ROYALTY_PAYMENTS', categoryTrusted: false, ticketIntent: null, isFirstMessage: true, subject: 'Royalty', latestAuthorMessage: 'When will my royalty for this book be paid?' });
  assert.equal(ok.category, 'ROYALTY_PAYMENTS');
});
