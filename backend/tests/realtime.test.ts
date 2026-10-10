import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyRead, firstUnreadId, mergeMessages, seenAt, unreadFor } from '../../frontend/lib/messages';
import type { Message } from '../../frontend/lib/types';
import { senderRoleToMark, toUnreadMap, unreadTotal } from '../src/modules/tickets/readState';

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = src.indexOf('\nexport ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
};

const msg = (id: string, role: 'AUTHOR' | 'ADMIN', t: string, readAt: string | null = null): Message => ({ id, ticketId: 't1', senderRole: role, body: id, createdAt: `2026-10-11T10:00:0${t}Z`, readAt });

// ---------------------------------------------------------------- read rules

test('recipient rules: authors read admin messages; admins read author messages', () => {
  assert.equal(senderRoleToMark('AUTHOR'), 'ADMIN');
  assert.equal(senderRoleToMark('ADMIN'), 'AUTHOR');
});

test('unread counts come from stored rows and ignore zero counts', () => {
  const map = toUnreadMap([{ ticketId: 'a', count: 2 }, { ticketId: 'b', count: 0 }, { ticketId: 'c', count: 1 }]);
  assert.deepEqual(map, { a: 2, c: 1 });
  assert.equal(unreadTotal(map), 3);
  assert.equal(unreadTotal({}), 0);
});

test('client unread view matches the stored read state', () => {
  const m = [msg('1', 'AUTHOR', '1', '2026-10-11T10:05:00Z'), msg('2', 'ADMIN', '2'), msg('3', 'ADMIN', '3'), msg('4', 'AUTHOR', '4')];
  assert.deepEqual(unreadFor(m, 'AUTHOR').map((x) => x.id), ['2', '3']); // author: unread support replies
  assert.deepEqual(unreadFor(m, 'ADMIN').map((x) => x.id), ['4']); // admin: unread author messages
  assert.equal(firstUnreadId(m, 'AUTHOR'), '2');
  const after = applyRead(m, 'AUTHOR', '2026-10-11T11:00:00Z');
  assert.equal(unreadFor(after, 'AUTHOR').length, 0);
  assert.equal(unreadFor(after, 'ADMIN').length, 1); // my own side is untouched
});

test('"seen" reflects when the other side read my newest message', () => {
  assert.equal(seenAt([msg('1', 'AUTHOR', '1'), msg('2', 'ADMIN', '2')], 'AUTHOR'), null);
  assert.equal(seenAt([msg('1', 'AUTHOR', '1', '2026-10-11T10:09:00Z')], 'AUTHOR'), '2026-10-11T10:09:00Z');
});

// ---------------------------------------------------------------- duplicates

test('a message delivered by both the API response and the socket event appears once', () => {
  const base = [msg('1', 'AUTHOR', '1')];
  const viaApi = mergeMessages(base, msg('2', 'ADMIN', '2'));
  const viaSocketToo = mergeMessages(viaApi, msg('2', 'ADMIN', '2'));
  assert.deepEqual(viaSocketToo.map((m) => m.id), ['1', '2']);
  assert.equal(mergeMessages(viaSocketToo, [msg('2', 'ADMIN', '2'), msg('2', 'ADMIN', '2')]).length, 2);
});

test('merge keeps chronological order for out-of-order arrivals and keeps a readAt once known', () => {
  const out = mergeMessages([msg('3', 'ADMIN', '3')], [msg('1', 'AUTHOR', '1'), msg('2', 'ADMIN', '2')]);
  assert.deepEqual(out.map((m) => m.id), ['1', '2', '3']);
  const seen = mergeMessages([msg('1', 'AUTHOR', '1', '2026-10-11T10:09:00Z')], msg('1', 'AUTHOR', '1', null));
  assert.equal(seen[0]!.readAt, '2026-10-11T10:09:00Z');
});

// ---------------------------------------------------------------- server behaviour (static)
// The API cannot be started here, so these assert the code paths from source. Runtime checks are NOT RUN.

test('persist before notify: emits happen after the database transaction, never inside it', () => {
  for (const [fn, event] of [['addAdminMessage', "realtime.toAuthor(ticket.author.userId, 'ticket:message'"], ['addAuthorMessage', "realtime.toAdmins('ticket:message'"]] as const) {
    const body = fnBody(read('src/modules/tickets/ticket.service.ts'), fn);
    const tx = body.indexOf('$transaction');
    const txEnd = body.indexOf('});', tx);
    const emit = body.indexOf(event);
    assert.ok(tx > -1 && emit > txEnd, `${fn}: emit must follow the committed transaction`);
  }
});

test('authors never receive internal notes, AI fields, drafts or sender identities', () => {
  const svc = read('src/modules/tickets/ticket.service.ts');
  for (const fn of ['listAuthorTickets', 'getAuthorTicket', 'markAuthorTicketRead', 'getAuthorUnread']) {
    const body = fnBody(svc, fn);
    assert.doesNotMatch(body, /internalNotes|ticketInternalNote|aiCategory|aiPriority|aiConfidence|\bintent\b|conversationState|contextSnapshot|aiDraft|sender:\s*\{/, fn);
  }
  // addAuthorMessage keeps conversation state server-side (a write), so judge what it hands back instead:
  // only the author-safe message select and the ticket status, to the author and to admins.
  const add = fnBody(svc, 'addAuthorMessage');
  assert.match(add, /select: messageSelect/);
  assert.match(add, /return \{ message, status: reopen \? 'OPEN' : ticket\.status \};/);
  assert.doesNotMatch(add, /internalNotes|aiDraft|contextSnapshot|sender:\s*\{/);
  // internal notes are only ever emitted to nobody: the only realtime call near notes is absent
  assert.doesNotMatch(fnBody(svc, 'addInternalNote'), /realtime\./);
  // and the realtime payload for author rooms is built from the author-safe message select
  assert.match(svc, /const messageSelect = \{[^}]*readAt: true[^}]*\} as const;/);
  assert.doesNotMatch(svc.match(/const messageSelect = \{[^}]*\}/)![0], /senderId|\bsender\b|note/i);
});

test('author read/unread endpoints are ownership-scoped and admin ones are admin-only', () => {
  const svc = read('src/modules/tickets/ticket.service.ts');
  assert.match(fnBody(svc, 'markAuthorTicketRead'), /findFirst\(\{ where: \{ id: ticketId, authorId \}/);
  assert.match(fnBody(svc, 'getAuthorUnread'), /authorUnreadMap\(authorId\)/);
  assert.match(svc, /groupBy\(\{\s*by: \['ticketId'\],\s*where: \{ senderRole: 'ADMIN', readAt: null, ticket: \{ authorId \} \}/);
  const routes = read('src/modules/tickets/tickets.routes.ts');
  assert.match(routes, /ticketsRouter\.use\(authenticate, requireAuthor\)/);
  assert.match(routes, /adminTicketsRouter\.use\(authenticate, requireAdmin\)/);
  assert.ok(routes.indexOf("ticketsRouter.get('/unread'") < routes.indexOf("ticketsRouter.get('/:id'"), '/unread must be declared before /:id');
  assert.ok(routes.indexOf("adminTicketsRouter.get('/unread'") < routes.indexOf("adminTicketsRouter.get('/:id'"));
});

test('sockets: unauthenticated connections are refused and authors only join their own room', () => {
  const src = read('src/realtime/socket.ts');
  assert.match(src, /if \(!token\) return next\(new Error\('unauthorized'\)\)/);
  assert.match(src, /socket\.join\(socket\.data\.role === 'ADMIN' \? 'admins' : `user:\$\{socket\.data\.userId\}`\)/);
  assert.match(src, /!user \|\| !user\.isActive/);
});

test('a failed write is never reported as sent: handlers only respond after the awaited service call', () => {
  const ctrl = read('src/modules/tickets/tickets.controller.ts');
  assert.match(fnBody(ctrl, 'adminReply'), /await service\.addAdminMessage[\s\S]*res\.status\(201\)/);
});
