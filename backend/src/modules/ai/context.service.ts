import { createHash } from 'node:crypto';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { buildFacts, collectAllowed, renderFacts, type AllowedValues, type Facts } from './logic/facts';
import { buildContextSnapshot, type ContextSnapshot } from './logic/contextSnapshot';
import { contextFingerprint } from './logic/fingerprint';
import { kbSlugsFor, routeFor } from './logic/routing';
import { isCategoryTrusted, resolveTopic, type Scope } from './logic/topic';
import type { BookFacts, Category, Intent, Route } from './logic/types';
import { KEEP_RECENT, SUMMARY_THRESHOLD } from './conversation.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export interface DraftContext {
  ticketId: string;
  route: Route;
  intent: Intent;
  category: Category | null;
  books: BookFacts[];
  facts: Facts | null;
  factsText: string | null;
  kbText: string | null;
  kbVersion: string;
  dbContextHash: string;
  conversationVersion: number;
  lastMessageId: string;
  lastSenderRole: 'AUTHOR' | 'ADMIN';
  firstName: string;
  subject: string;
  current: string;
  recent: { from: 'Author' | 'BookLeaf'; body: string }[];
  summary: string | null;
  needsSummary: boolean;
  authorText: string;
  allowed: AllowedValues;
  requiresTimeline: boolean;
  scope: Scope;
  snapshot: ContextSnapshot; // what is being supplied, stored with the draft for admin verification
}

const BOOK_SELECT = {
  bookCode: true, title: true, isbn: true, status: true, publicationDate: true, mrp: true, authorRoyaltyPerCopy: true,
  totalCopiesSold: true, totalRoyaltyEarned: true, royaltyPaid: true, royaltyPending: true,
  lastRoyaltyPayoutDate: true, printPartner: true, availableOn: true,
} as const;

// Decides which sources an answer needs and gathers ONLY those: minimal, private context.
// Never reads internal notes, other authors' data, or contact details.
export async function buildContext(ticketId: string, now = new Date()): Promise<DraftContext> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, subject: true, category: true, aiCategory: true, categoryOverridden: true, intent: true, authorId: true, bookId: true,
      author: { select: { user: { select: { name: true } } } },
      book: { select: BOOK_SELECT },
      conversationState: true,
    },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');

  const [messageCount, recentDesc, firstMessage, latestAuthor] = await Promise.all([
    prisma.ticketMessage.count({ where: { ticketId } }),
    prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, senderRole: true, body: true } }),
    prisma.ticketMessage.findFirst({ where: { ticketId }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
    prisma.ticketMessage.findFirst({ where: { ticketId, senderRole: 'AUTHOR' }, orderBy: { createdAt: 'desc' }, select: { id: true, body: true } }),
  ]);
  const lastMessage = recentDesc[0];
  if (!lastMessage || !latestAuthor) throw Errors.badRequest('Ticket has no author message to answer');

  let state = ticket.conversationState ?? (await prisma.conversationState.create({ data: { ticketId, lastMessageId: lastMessage.id } }));

  // Current message takes precedence over the original classification.
  const topic = resolveTopic({
    ticketCategory: ticket.category,
    categoryTrusted: isCategoryTrusted(ticket),
    ticketIntent: ticket.intent,
    latestAuthorMessage: latestAuthor.body,
    isFirstMessage: latestAuthor.id === firstMessage?.id,
    subject: ticket.subject,
  });
  if (topic.changed && state.currentTopic !== topic.category) {
    state = await prisma.conversationState.update({ where: { ticketId }, data: { currentTopic: topic.category, version: { increment: 1 } } });
  } else if (!state.currentTopic && topic.category) {
    state = await prisma.conversationState.update({ where: { ticketId }, data: { currentTopic: topic.category } });
  }

  const firstName = (ticket.author.user.name.split(' ')[0] ?? 'there').trim();

  // Scope gate: an unrelated or unclear latest message gets NO author data and NO Knowledge Base
  // text (not even loaded), so nothing irrelevant can reach a prompt, template, cache entry or draft.
  if (topic.scope === 'OUT_OF_SCOPE' || topic.scope === 'UNCLEAR') {
    const route: Route = 'INSUFFICIENT_INFORMATION';
    return {
      ticketId, route, intent: 'OTHER', category: null, books: [], facts: null, factsText: null, kbText: null, kbVersion: 'none',
      dbContextHash: contextFingerprint({ facts: null, category: null, intent: 'OTHER', route, scope: topic.scope }),
      conversationVersion: state.version, lastMessageId: lastMessage.id, lastSenderRole: lastMessage.senderRole as 'AUTHOR' | 'ADMIN',
      firstName, subject: ticket.subject, current: '', recent: [], summary: null, needsSummary: false, authorText: '',
      allowed: collectAllowed([], 'OTHER', now), requiresTimeline: false, scope: topic.scope,
      snapshot: buildContextSnapshot({ scope: topic.scope, intent: 'OTHER', category: null, route, books: [], facts: null, kbDocs: [], kbVersion: 'none', kbExpected: false, query: '' }),
    };
  }

  const books: BookFacts[] = ticket.book
    ? [ticket.book]
    : await prisma.book.findMany({ where: { authorId: ticket.authorId }, orderBy: { bookCode: 'asc' }, select: BOOK_SELECT });

  let route = routeFor(topic.intent, books.length);
  const category: Category | null = topic.category;

  const facts = route === 'DB_ONLY' || route === 'HYBRID' ? buildFacts(topic.intent, books, firstName, now) : null;

  let kbText: string | null = null;
  let kbVersion = 'none';
  let kbDocs: Awaited<ReturnType<typeof prisma.knowledgeDocument.findMany>> = [];
  const kbExpected = route === 'KB_ONLY' || route === 'HYBRID';
  if (kbExpected) {
    const slugs = kbSlugsFor(category ?? 'GENERAL_INQUIRY', topic.intent);
    const docs = await prisma.knowledgeDocument.findMany({ where: { slug: { in: slugs } } });
    docs.sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
    kbDocs = docs;
    if (docs.length === 0) {
      route = 'INSUFFICIENT_INFORMATION'; // cannot ground an answer without the KB
    } else {
      kbText = docs.map((d) => `## ${d.title}\n${d.content}`).join('\n\n');
      kbVersion = sha(docs.map((d) => `${d.slug}@${d.version}`).join('|'));
    }
  }

  const needsSummary = (route === 'KB_ONLY' || route === 'HYBRID') && messageCount > SUMMARY_THRESHOLD;
  const window = needsSummary ? KEEP_RECENT : 6;
  const recent = [...recentDesc]
    .reverse()
    .filter((m) => m.id !== latestAuthor.id)
    .slice(-window)
    .map((m) => ({ from: (m.senderRole === 'AUTHOR' ? 'Author' : 'BookLeaf') as 'Author' | 'BookLeaf', body: m.body }));

  const authorText = [ticket.subject, ...recentDesc.filter((m) => m.senderRole === 'AUTHOR').map((m) => m.body), latestAuthor.body].join('\n');

  return {
    ticketId,
    route,
    intent: topic.intent,
    category,
    books,
    facts,
    factsText: facts ? renderFacts(facts) : null,
    kbText,
    kbVersion,
    dbContextHash: contextFingerprint({ facts, category, intent: topic.intent, route, scope: topic.scope }),
    conversationVersion: state.version,
    lastMessageId: lastMessage.id,
    lastSenderRole: lastMessage.senderRole as 'AUTHOR' | 'ADMIN',
    firstName,
    subject: ticket.subject,
    current: latestAuthor.body,
    recent,
    summary: needsSummary ? state.summary : null,
    needsSummary,
    authorText,
    allowed: collectAllowed(books, topic.intent, now),
    scope: topic.scope,
    snapshot: buildContextSnapshot({
      scope: topic.scope, intent: topic.intent, category, route, books, facts: route === 'INSUFFICIENT_INFORMATION' ? null : facts, kbDocs, kbVersion, kbExpected,
      query: `${ticket.subject}\n${latestAuthor.body}`,
    }),
    requiresTimeline: topic.intent === 'ISBN_ISSUE' || topic.intent === 'PRINT_QUALITY_ISSUE' || topic.intent === 'AVAILABILITY_ISSUE',
  };
}
