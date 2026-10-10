// Unit tests for the deterministic AI logic (routing, topic, facts, validation, parsing).
// No database, network or LLM needed:  npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildFacts, collectAllowed, renderFacts } from '../src/modules/ai/logic/facts';
import { latestQuarterPayout } from '../src/modules/ai/logic/format';
import { applyPriorityFloor, parseClassification, parseDraftReply } from '../src/modules/ai/logic/output';
import { contextFingerprint } from '../src/modules/ai/logic/fingerprint';
import { kbSlugsFor, resolveIntent, routeFor } from '../src/modules/ai/logic/routing';
import { outOfScopeTemplate, salesTemplate } from '../src/modules/ai/logic/templates';
import { assessScope, detectTopic, refineIntent, resolveTopic } from '../src/modules/ai/logic/topic';
import type { BookFacts } from '../src/modules/ai/logic/types';
import { validateDraft } from '../src/modules/ai/logic/validateDraft';

const data = JSON.parse(readFileSync(path.join(__dirname, '../prisma/data/bookleaf_sample_data.json'), 'utf8'));
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const book = (id: string): BookFacts => {
  const b = data.authors.flatMap((a: any) => a.books).find((x: any) => x.book_id === id);
  return {
    title: b.title, isbn: b.isbn, status: b.status, publicationDate: toDate(b.publication_date), mrp: b.mrp,
    authorRoyaltyPerCopy: b.author_royalty_per_copy, totalCopiesSold: b.total_copies_sold,
    totalRoyaltyEarned: b.total_royalty_earned, royaltyPaid: b.royalty_paid, royaltyPending: b.royalty_pending,
    lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date), printPartner: b.print_partner, availableOn: b.available_on,
  };
};
const NOW = new Date('2026-10-08T10:00:00Z');

test('routing: DB_ONLY / KB_ONLY / HYBRID / INSUFFICIENT', () => {
  assert.equal(routeFor('SALES_FIGURES', 1), 'DB_ONLY');
  assert.equal(routeFor('POLICY_QUESTION', 0), 'KB_ONLY');
  assert.equal(routeFor('ROYALTY_STATUS', 2), 'HYBRID');
  assert.equal(routeFor('ROYALTY_STATUS', 0), 'INSUFFICIENT_INFORMATION');
  assert.equal(routeFor('OTHER', 3), 'INSUFFICIENT_INFORMATION');
});

test('admin category override discards an incompatible AI intent', () => {
  assert.equal(resolveIntent('ISBN_METADATA', 'ROYALTY_STATUS'), 'ISBN_ISSUE');
  assert.equal(resolveIntent('ROYALTY_PAYMENTS', 'SALES_FIGURES'), 'SALES_FIGURES');
  assert.equal(resolveIntent(null, null), 'OTHER');
});

test('KB retrieval is a deterministic category -> section mapping', () => {
  assert.deepEqual(kbSlugsFor('ROYALTY_PAYMENTS', 'ROYALTY_STATUS'), ['royalty-policy']);
  assert.deepEqual(kbSlugsFor('GENERAL_INQUIRY', 'OTHER'), ['company-overview', 'general-faq']);
});

test('topic change: current message wins over the original classification', () => {
  assert.equal(detectTopic('Forget that. My book is unavailable on Amazon.'), 'DISTRIBUTION_AVAILABILITY');
  const r = resolveTopic({ ticketCategory: 'ROYALTY_PAYMENTS', ticketIntent: 'ROYALTY_STATUS', latestAuthorMessage: 'Forget that. My book is unavailable on Amazon.', isFirstMessage: false });
  assert.equal(r.category, 'DISTRIBUTION_AVAILABILITY');
  assert.equal(r.intent, 'AVAILABILITY_ISSUE');
  assert.equal(r.changed, true);
  // first message never triggers a "change"
  const first = resolveTopic({ ticketCategory: 'ROYALTY_PAYMENTS', ticketIntent: 'ROYALTY_STATUS', latestAuthorMessage: 'Amazon shows unavailable', isFirstMessage: true });
  assert.equal(first.changed, false);
  assert.equal(detectTopic('thanks a lot'), null);
});

test('quarter payout deadline = quarter end + 45 days', () => {
  const q = latestQuarterPayout(NOW);
  assert.equal(q.quarterEnd.toISOString().slice(0, 10), '2026-09-30');
  assert.equal(q.deadline.toISOString().slice(0, 10), '2026-11-14');
  assert.equal(q.deadlinePassed, false);
});

test('facts: sub-threshold pending royalty rolls over (BK016, Rs 850)', () => {
  const facts = buildFacts('ROYALTY_STATUS', [book('BK016')], 'Kavita', NOW);
  const text = renderFacts(facts);
  assert.match(text, /Royalty pending: ₹850/);
  assert.match(text, /below the ₹1,000 minimum payout threshold/);
  assert.match(text, /No payout made yet/);
});

test('facts: above-threshold never-paid book is flagged for investigation (BK005)', () => {
  const text = renderFacts(buildFacts('ROYALTY_STATUS', [book('BK005')], 'Ananya', NOW));
  assert.match(text, /no payout has been made yet/);
  assert.match(text, /₹2,546/);
});

test('facts: production books have no sales/royalty claims (BK013, BK015)', () => {
  const text = renderFacts(buildFacts('SALES_FIGURES', [book('BK013')], 'Sneha', NOW));
  assert.match(text, /still in production/);
  assert.match(text, /In Production - Cover Design/);
  const tpl = salesTemplate('Sneha', [book('BK013')]);
  assert.match(tpl, /has not been published yet/);
});

test('facts only include fields the intent needs (minimal context)', () => {
  const text = renderFacts(buildFacts('PRINT_QUALITY_ISSUE', [book('BK003')], 'Rohit', NOW));
  assert.match(text, /Print partner: Repro India/);
  assert.doesNotMatch(text, /royalty/i);
  assert.doesNotMatch(text, /@|\+91/); // no contact details ever
});

test('DB_ONLY template is deterministic and passes validation (BK001: 342 copies)', () => {
  const books = [book('BK001')];
  const reply = salesTemplate('Priya', books);
  assert.match(reply, /342 copies/);
  assert.match(reply, /₹11,970/);
  const v = validateDraft({ reply, allowed: collectAllowed(books, 'SALES_FIGURES', NOW), authorText: 'How many copies have I sold?', requiresTimeline: false });
  assert.equal(v.status, 'PASSED', JSON.stringify(v.issues));
});

test('validator rejects an amount that contradicts the database', () => {
  const books = [book('BK001')];
  const reply = 'Hi Priya, you are owed ₹5,000 in pending royalties. Our team will confirm the payout within 48 hours. Please reply if anything looks off.';
  const v = validateDraft({ reply, allowed: collectAllowed(books, 'ROYALTY_STATUS', NOW), authorText: 'Where is my royalty?', requiresTimeline: false });
  assert.equal(v.status, 'REJECTED');
  assert.ok(v.issues.some((i) => i.code === 'AMOUNT_NOT_IN_FACTS'));
});

test('validator accepts correct DB values, KB timelines and policy dates', () => {
  const books = [book('BK001')];
  const reply = 'Hi Priya, thank you for writing in. Your pending royalty for "Whispers of the Ganges" is ₹3,570. Royalties for the quarter ended 30 September 2026 are paid by 14 November 2026. Our team will look into this and get back to you within 48 hours. Please reply here if you have questions.';
  const v = validateDraft({ reply, allowed: collectAllowed(books, 'ROYALTY_STATUS', NOW), authorText: 'Royalty?', requiresTimeline: true });
  assert.equal(v.status, 'PASSED', JSON.stringify(v.issues));
});

test('validator rejects invented dates, copies, ISBNs and status contradictions', () => {
  const published = [book('BK001')];
  const bad = validateDraft({ reply: 'Hi Priya, your payout was sent on 3 March 2025 and your 999 copies are doing well. ISBN 978-93-5XXXX-99-9 is correct. Our team will follow up.', allowed: collectAllowed(published, 'ROYALTY_STATUS', NOW), authorText: 'x', requiresTimeline: false });
  const codes = bad.issues.map((i) => i.code);
  assert.ok(codes.includes('DATE_NOT_IN_FACTS'));
  assert.ok(codes.includes('COPIES_MISMATCH'));
  assert.ok(codes.includes('ISBN_NOT_IN_FACTS'));

  const prod = [book('BK013')];
  const contra = validateDraft({ reply: 'Hi Sneha, great news: your book is now live on Amazon. Our team will keep you posted on any changes.', allowed: collectAllowed(prod, 'PRODUCTION_STATUS', NOW), authorText: 'status?', requiresTimeline: false });
  assert.ok(contra.issues.some((i) => i.code === 'STATUS_CONTRADICTION'));
  assert.equal(contra.status, 'REJECTED');
});

test('validator flags unknown timelines and a missing next step (soft issues)', () => {
  const books = [book('BK003')];
  const v = validateDraft({ reply: 'Hi Rohit, sorry about the trouble with your copies. This will be sorted within 3 weeks and 9 days overall, thanks for your patience with us.', allowed: collectAllowed(books, 'PRINT_QUALITY_ISSUE', NOW), authorText: 'bad print', requiresTimeline: true });
  assert.equal(v.status, 'FLAGGED');
  assert.ok(v.issues.some((i) => i.code === 'TIMELINE_NOT_IN_KB'));
});

test('classification parser enforces the schema', () => {
  const ok = parseClassification('```json\n{"category":"ROYALTY_PAYMENTS","priority":"HIGH","intent":"ROYALTY_STATUS","confidence":0.94}\n```');
  assert.equal(ok.category, 'ROYALTY_PAYMENTS');
  assert.throws(() => parseClassification('{"category":"NOPE","priority":"HIGH","intent":"OTHER","confidence":0.5}'));
  assert.throws(() => parseClassification('{"category":"GENERAL_INQUIRY","priority":"LOW","intent":"OTHER","confidence":1.5}'));
  assert.throws(() => parseClassification('not json at all'));
  assert.equal(parseDraftReply('{"reply":"  Hello  "}'), 'Hello');
  assert.throws(() => parseDraftReply('{"reply":""}'));
});

test('ISBN issues are always at least HIGH priority (KB rule)', () => {
  assert.equal(applyPriorityFloor('ISBN_ISSUE', 'LOW'), 'HIGH');
  assert.equal(applyPriorityFloor('ISBN_ISSUE', 'CRITICAL'), 'CRITICAL');
  assert.equal(applyPriorityFloor('SALES_FIGURES', 'LOW'), 'LOW');
});

// ---- Regression: stale SALES_FIGURES intent on a later royalty-status message ----
const ROYALTY_Q = 'How much is my royalty and when will I be paid?';
const followUp = (intent: any, msg: string, category: any = 'ROYALTY_PAYMENTS', isFirstMessage = false) =>
  resolveTopic({ ticketCategory: category, ticketIntent: intent, latestAuthorMessage: msg, isFirstMessage });

test('stale intent: sales ticket + royalty-status follow-up resolves to ROYALTY_STATUS -> HYBRID + royalty policy', () => {
  const r = followUp('SALES_FIGURES', ROYALTY_Q);
  assert.equal(r.category, 'ROYALTY_PAYMENTS');
  assert.equal(r.intent, 'ROYALTY_STATUS');
  assert.equal(r.changed, false); // same category: conversation version is not bumped
  assert.equal(routeFor(r.intent, 1), 'HYBRID');
  assert.deepEqual(kbSlugsFor(r.category!, r.intent), ['royalty-policy']);
  // the HYBRID facts carry what the sales-only template lacked (pending royalty / payout context)
  assert.match(renderFacts(buildFacts(r.intent, [book('BK016')], 'Kavita', NOW)), /850/);
});

test('sales-only follow-ups stay SALES_FIGURES -> DB_ONLY (zero draft LLM calls)', () => {
  for (const msg of ['How many copies of my book have been sold?', 'What are my total sales?', 'thanks!']) {
    const r = followUp('SALES_FIGURES', msg);
    assert.equal(r.intent, 'SALES_FIGURES', msg);
    assert.equal(routeFor(r.intent, 1), 'DB_ONLY', msg);
  }
});

test('no downgrade: a royalty-status intent is never moved to SALES_FIGURES / DB_ONLY', () => {
  for (const msg of ['How many copies have I sold?', 'total sales figures please', ROYALTY_Q]) {
    for (const intent of ['ROYALTY_STATUS', 'ROYALTY_CALCULATION', 'POLICY_QUESTION'] as const) {
      assert.equal(followUp(intent, msg).intent, intent, `${intent} / ${msg}`);
    }
  }
  assert.equal(refineIntent('ROYALTY_PAYMENTS', 'ROYALTY_STATUS', 'copies sold'), 'ROYALTY_STATUS');
});

test('refinement is limited: first message trusts the AI intent, other categories untouched', () => {
  assert.equal(followUp('SALES_FIGURES', ROYALTY_Q, 'ROYALTY_PAYMENTS', true).intent, 'SALES_FIGURES');
  assert.equal(refineIntent('GENERAL_INQUIRY', 'SALES_FIGURES', ROYALTY_Q), 'SALES_FIGURES');
  assert.equal(followUp('ISBN_ISSUE', 'The ISBN is wrong', 'ISBN_METADATA').intent, 'ISBN_ISSUE');
});

test('topic change still wins and still resets the intent (no regression)', () => {
  const r = followUp('SALES_FIGURES', 'Forget that. My book is unavailable on Amazon.');
  assert.equal(r.category, 'DISTRIBUTION_AVAILABILITY');
  assert.equal(r.intent, 'AVAILABILITY_ISSUE');
  assert.equal(r.changed, true);
});

test('admin category override still discards an incompatible intent after refinement', () => {
  const r = followUp('SALES_FIGURES', 'Cover looks blurry in print', 'PRINTING_QUALITY');
  assert.equal(r.intent, 'PRINT_QUALITY_ISSUE');
});

test('no books -> INSUFFICIENT_INFORMATION even after upgrade (never invents author data)', () => {
  assert.equal(routeFor(followUp('SALES_FIGURES', ROYALTY_Q).intent, 0), 'INSUFFICIENT_INFORMATION');
});

test('cache fingerprint: changes with intent, route or category; stable otherwise', () => {
  const facts = buildFacts('SALES_FIGURES', [book('BK001')], 'Priya', NOW);
  const base = { facts, category: 'ROYALTY_PAYMENTS' as const, intent: 'SALES_FIGURES' as const, route: 'DB_ONLY' as const };
  assert.equal(contextFingerprint(base), contextFingerprint({ ...base })); // same inputs -> cache hit
  assert.notEqual(contextFingerprint(base), contextFingerprint({ ...base, intent: 'ROYALTY_STATUS', route: 'HYBRID' }));
  assert.notEqual(contextFingerprint(base), contextFingerprint({ ...base, route: 'HYBRID' }));
  assert.notEqual(contextFingerprint(base), contextFingerprint({ ...base, category: 'GENERAL_INQUIRY' }));
  // identical facts, different intent (same KB version) must still miss the cache
  assert.notEqual(
    contextFingerprint({ ...base, intent: 'ROYALTY_STATUS', route: 'HYBRID' }),
    contextFingerprint({ ...base, intent: 'ROYALTY_CALCULATION', route: 'HYBRID' }),
  );
});

// ---- Regression: unrelated / out-of-scope messages must not inherit ticket metadata or author data ----
const CRICKET = 'Who is the captain of the Indian cricket team?';

test('scope: unrelated message after a royalty message is OUT_OF_SCOPE, no category/intent inherited', () => {
  for (const intent of ['ROYALTY_STATUS', 'SALES_FIGURES'] as const) {
    const r = followUp(intent, CRICKET);
    assert.equal(r.scope, 'OUT_OF_SCOPE');
    assert.equal(r.category, null);
    assert.equal(r.intent, 'OTHER');
    assert.equal(r.changed, false);
    // the route is INSUFFICIENT_INFORMATION, so context.service loads no books, facts or KB
    assert.equal(routeFor(r.intent, 3), 'INSUFFICIENT_INFORMATION');
  }
  // other unrelated, general-knowledge style messages (no phrase-specific rule)
  for (const msg of ['What is the weather like in Mumbai today?', 'Can you recommend a good restaurant nearby?', 'Tell me a joke about football please']) {
    assert.equal(followUp('ROYALTY_STATUS', msg).scope, 'OUT_OF_SCOPE', msg);
  }
});

test('scope: genuine in-scope questions keep their routes (royalty -> HYBRID, sales -> DB_ONLY)', () => {
  const roy = followUp('SALES_FIGURES', ROYALTY_Q);
  assert.equal(roy.scope, 'IN_SCOPE');
  assert.equal(routeFor(roy.intent, 1), 'HYBRID');
  const sales = followUp('SALES_FIGURES', 'How many copies of my book have been sold?');
  assert.equal(sales.scope, 'IN_SCOPE');
  assert.equal(routeFor(sales.intent, 1), 'DB_ONLY');
});

test('scope: clear short continuations keep the previous topic; vague/unrelated ones do not', () => {
  for (const msg of ['why?', 'Any update on that?', 'thanks!', 'ok please check again']) {
    const r = followUp('ROYALTY_STATUS', msg);
    assert.equal(r.scope, 'CONTINUATION', msg);
    assert.equal(r.intent, 'ROYALTY_STATUS', msg);
    assert.equal(r.category, 'ROYALTY_PAYMENTS', msg);
  }
  // too short and no continuation marker -> manual review, nothing inherited
  assert.equal(followUp('ROYALTY_STATUS', 'hmm so').scope, 'UNCLEAR');
  // a long unrelated question containing a marker word is NOT a continuation
  assert.equal(followUp('ROYALTY_STATUS', 'Who is the prime minister of India and why is that so?').scope, 'OUT_OF_SCOPE');
  assert.equal(assessScope('thanks', { allowContinuation: false }), 'UNCLEAR'); // first messages have no history
});

test('scope: topic change and royalty refinement are unaffected by the gate', () => {
  const t = followUp('ROYALTY_STATUS', 'Forget that. My book is unavailable on Amazon.');
  assert.equal(t.scope, 'IN_SCOPE');
  assert.equal(t.changed, true);
  assert.equal(followUp('SALES_FIGURES', ROYALTY_Q).intent, 'ROYALTY_STATUS');
});

test('scope: first messages are gated when the AI did not choose a specific category', () => {
  const unrelated = (category: any) => resolveTopic({ ticketCategory: category, ticketIntent: 'OTHER', latestAuthorMessage: CRICKET, isFirstMessage: true, subject: 'Question' });
  assert.equal(unrelated(null).scope, 'OUT_OF_SCOPE');
  assert.equal(unrelated('GENERAL_INQUIRY').scope, 'OUT_OF_SCOPE');
  // a legitimate general inquiry with BookLeaf vocabulary passes the gate
  const ok = resolveTopic({ ticketCategory: 'GENERAL_INQUIRY', ticketIntent: 'POLICY_QUESTION', latestAuthorMessage: 'How do I update my author bio?', isFirstMessage: true, subject: 'Bio' });
  assert.equal(ok.scope, 'IN_SCOPE');
  assert.equal(ok.intent, 'POLICY_QUESTION');
  // AI chose a specific category: trusted, as before
  const trusted = resolveTopic({ ticketCategory: 'ROYALTY_PAYMENTS', ticketIntent: 'ROYALTY_STATUS', latestAuthorMessage: 'my payment has not arrived', isFirstMessage: true, subject: 'Payment' });
  assert.equal(trusted.scope, 'IN_SCOPE');
  assert.equal(trusted.intent, 'ROYALTY_STATUS');
});

test('privacy: redirect template contains only the first name, no author data, and passes validation', () => {
  const body = outOfScopeTemplate('Priya');
  assert.match(body, /^Hi Priya,/);
  assert.match(body, /outside the scope of our support services/);
  assert.match(body, /BookLeaf Author Support$/);
  assert.doesNotMatch(body, /\d|₹|Rs\.?|isbn|royalty (earned|paid|pending)|Priya Sharma/i);
  for (const b of data.authors.flatMap((a: any) => a.books)) assert.ok(!body.includes(b.title), b.title);
  const v = validateDraft({ reply: body, allowed: collectAllowed([], 'OTHER', NOW), authorText: '', requiresTimeline: false });
  assert.notEqual(v.status, 'REJECTED');
});

test('cache fingerprint: scope is part of the key; out-of-scope never matches an in-scope draft', () => {
  const inScope = { facts: buildFacts('ROYALTY_STATUS', [book('BK001')], 'Priya', NOW), category: 'ROYALTY_PAYMENTS' as const, intent: 'ROYALTY_STATUS' as const, route: 'HYBRID' as const, scope: 'IN_SCOPE' as const };
  const out = { facts: null, category: null, intent: 'OTHER' as const, route: 'INSUFFICIENT_INFORMATION' as const, scope: 'OUT_OF_SCOPE' as const };
  assert.notEqual(contextFingerprint(inScope), contextFingerprint(out));
  assert.notEqual(contextFingerprint(out), contextFingerprint({ ...out, scope: 'UNCLEAR' }));
  assert.equal(contextFingerprint(out), contextFingerprint({ ...out }));
  // out-of-scope fingerprint depends on no author facts at all
  assert.equal(JSON.stringify(out).includes('Priya'), false);
});
