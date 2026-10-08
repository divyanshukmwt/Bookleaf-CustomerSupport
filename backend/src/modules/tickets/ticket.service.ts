import type { Prisma } from '@prisma/client';
import { logger } from '../../config/logger';
import { audit } from '../../lib/audit';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { realtime } from '../../realtime/socket';
import { detectTopic } from '../ai/logic/topic';
import type { AdminListQuery, AdminUpdateInput, CreateTicketInput } from './ticket.schemas';

const messageSelect = { id: true, ticketId: true, senderRole: true, body: true, createdAt: true } as const;

// ------------------------------------------------------------------ author side

export async function createTicket(authorId: string, userId: string, input: CreateTicketInput) {
  if (input.bookId) {
    // Ownership check: the book must belong to this author. 404 (not 403) so ids can't be probed.
    const book = await prisma.book.findFirst({ where: { id: input.bookId, authorId }, select: { id: true } });
    if (!book) throw Errors.notFound('Book not found');
  }

  // Ticket + first message + conversation state are saved atomically. Nothing here touches AI.
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: { authorId, bookId: input.bookId, subject: input.subject },
      select: { id: true, ticketNumber: true, subject: true, status: true, createdAt: true, book: { select: { id: true, title: true } } },
    });
    const message = await tx.ticketMessage.create({ data: { ticketId: created.id, senderId: userId, senderRole: 'AUTHOR', body: input.description } });
    await tx.conversationState.create({ data: { ticketId: created.id, lastMessageId: message.id } });
    return created;
  });

  logger.info({ event: 'ticket.created', ticketId: ticket.id, authorId, bookScoped: Boolean(input.bookId) }, 'ticket created');
  void audit(userId, 'ticket.created', 'ticket', ticket.id);
  realtime.toAdmins('ticket:created', { ticketId: ticket.id });
  return ticket;
}

export async function listAuthorTickets(authorId: string) {
  return prisma.ticket.findMany({
    where: { authorId },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true, ticketNumber: true, subject: true, status: true, createdAt: true, lastMessageAt: true,
      book: { select: { id: true, title: true } },
      _count: { select: { messages: true } },
    },
  });
}

export async function getAuthorTicket(authorId: string, ticketId: string) {
  // Internal notes and AI fields are never selected here, so they cannot reach an author.
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, authorId },
    select: {
      id: true, ticketNumber: true, subject: true, status: true, createdAt: true, lastMessageAt: true,
      book: { select: { id: true, title: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: messageSelect },
    },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');
  return ticket;
}

export async function addAuthorMessage(authorId: string, userId: string, ticketId: string, body: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, authorId }, select: { id: true, status: true } });
  if (!ticket) throw Errors.notFound('Ticket not found');
  if (ticket.status === 'CLOSED') throw Errors.conflict('This ticket is closed. Please open a new ticket for further questions.');

  const reopen = ticket.status === 'RESOLVED';
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: 'AUTHOR', body }, select: messageSelect });
    await tx.ticket.update({ where: { id: ticketId }, data: { lastMessageAt: m.createdAt, ...(reopen ? { status: 'OPEN' } : {}) } });
    // Lightweight state only (no LLM): remember the newest message and note a topic shift by keyword.
    const topic = detectTopic(body);
    const state = await tx.conversationState.findUnique({ where: { ticketId }, select: { currentTopic: true } });
    await tx.conversationState.upsert({
      where: { ticketId },
      create: { ticketId, lastMessageId: m.id, currentTopic: topic },
      update: { lastMessageId: m.id, ...(topic && topic !== state?.currentTopic ? { currentTopic: topic, version: { increment: 1 } } : {}) },
    });
    return m;
  });

  logger.info({ event: 'message.created', ticketId, senderRole: 'AUTHOR', reopened: reopen }, 'author message saved');
  if (reopen) void audit(userId, 'ticket.reopened', 'ticket', ticketId);
  realtime.toAdmins('ticket:message', { ticketId, message });
  realtime.toAdmins('ticket:updated', { ticketId });
  return { message, status: reopen ? 'OPEN' : ticket.status };
}

// ------------------------------------------------------------------ admin side

const adminListSelect = {
  id: true, ticketNumber: true, subject: true, status: true, category: true, priority: true,
  categoryOverridden: true, priorityOverridden: true, aiStatus: true, aiConfidence: true,
  createdAt: true, lastMessageAt: true,
  assignedTo: { select: { id: true, name: true } },
  author: { select: { authorCode: true, user: { select: { name: true } } } },
  book: { select: { id: true, title: true } },
} satisfies Prisma.TicketSelect;

export async function listAdminTickets(adminId: string, q: AdminListQuery) {
  const and: Prisma.TicketWhereInput[] = [];
  if (q.status?.length) and.push({ status: { in: q.status } });
  if (q.category?.length) and.push({ category: { in: q.category } });
  if (q.priority?.length) and.push({ priority: { in: q.priority } });
  if (q.assignee === 'me') and.push({ assignedToId: adminId });
  if (q.assignee === 'unassigned') and.push({ assignedToId: null });
  if (q.from) and.push({ createdAt: { gte: q.from } });
  if (q.to) and.push({ createdAt: { lte: new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1) } }); // inclusive day
  if (q.search) {
    const asNumber = /^\d+$/.test(q.search) ? Number(q.search) : null;
    and.push({
      OR: [
        { subject: { contains: q.search, mode: 'insensitive' } },
        { author: { user: { name: { contains: q.search, mode: 'insensitive' } } } },
        ...(asNumber !== null ? [{ ticketNumber: asNumber }] : []),
      ],
    });
  }
  const where: Prisma.TicketWhereInput = and.length ? { AND: and } : {};

  // Enum order in Postgres follows declaration order, so priority ASC = CRITICAL first.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    q.sort === 'newest'
      ? [{ createdAt: 'desc' }]
      : q.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : [{ priority: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }];

  const [total, items] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: adminListSelect }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function getAdminTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      ...adminListSelect,
      aiCategory: true, aiPriority: true, intent: true, aiError: true,
      author: { select: { authorCode: true, city: true, user: { select: { name: true, email: true } } } },
      book: { select: { id: true, title: true, isbn: true, status: true, totalCopiesSold: true, royaltyPending: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: messageSelect },
      internalNotes: { orderBy: { createdAt: 'asc' }, select: { id: true, body: true, createdAt: true, createdBy: { select: { id: true, name: true } } } },
      conversationState: { select: { currentTopic: true, summary: true, version: true } },
    },
  });
  if (!ticket) throw Errors.notFound('Ticket not found');
  return ticket;
}

export async function updateTicketAsAdmin(adminId: string, ticketId: string, input: AdminUpdateInput) {
  const existing = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true, category: true, priority: true, assignedToId: true, author: { select: { userId: true } } } });
  if (!existing) throw Errors.notFound('Ticket not found');

  const data: Prisma.TicketUpdateInput = {};
  if (input.status) data.status = input.status;
  if (input.category) {
    data.category = input.category;
    data.categoryOverridden = true; // a late AI result must not overwrite this
  }
  if (input.priority) {
    data.priority = input.priority;
    data.priorityOverridden = true;
  }
  if (input.assignedToId !== undefined) {
    const target = input.assignedToId === 'me' ? adminId : input.assignedToId;
    if (target) {
      const admin = await prisma.user.findFirst({ where: { id: target, role: 'ADMIN', isActive: true }, select: { id: true } });
      if (!admin) throw Errors.badRequest('Assignee must be an active admin');
      data.assignedTo = { connect: { id: target } };
    } else {
      data.assignedTo = { disconnect: true };
    }
  }

  await prisma.ticket.update({ where: { id: ticketId }, data });
  logger.info({ event: 'ticket.updated', ticketId, adminId, changes: Object.keys(input) }, 'ticket updated by admin');
  void audit(adminId, 'ticket.updated', 'ticket', ticketId, { from: { status: existing.status, category: existing.category, priority: existing.priority, assignedToId: existing.assignedToId }, changes: input } as Prisma.InputJsonValue);

  if (input.status && input.status !== existing.status) {
    realtime.toAuthor(existing.author.userId, 'ticket:updated', { ticketId, status: input.status });
  }
  realtime.toAdmins('ticket:updated', { ticketId });
  return getAdminTicket(ticketId);
}

export async function addAdminMessage(adminId: string, ticketId: string, body: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true, author: { select: { userId: true } } } });
  if (!ticket) throw Errors.notFound('Ticket not found');
  if (ticket.status === 'CLOSED') throw Errors.conflict('Ticket is closed. Reopen it before replying.');

  // 1) persist (source of truth) 2) emit. A failed emit never fails the request.
  const nextStatus = ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status;
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({ data: { ticketId, senderId: adminId, senderRole: 'ADMIN', body }, select: messageSelect });
    await tx.ticket.update({ where: { id: ticketId }, data: { lastMessageAt: m.createdAt, status: nextStatus } });
    await tx.conversationState.updateMany({ where: { ticketId }, data: { lastMessageId: m.id } });
    return m;
  });

  logger.info({ event: 'message.created', ticketId, senderRole: 'ADMIN', adminId }, 'admin reply saved');
  void audit(adminId, 'message.sent', 'ticket', ticketId, { messageId: message.id });
  realtime.toAuthor(ticket.author.userId, 'ticket:message', { ticketId, message });
  realtime.toAuthor(ticket.author.userId, 'ticket:updated', { ticketId, status: nextStatus });
  realtime.toAdmins('ticket:updated', { ticketId });
  return { message, status: nextStatus };
}

export async function addInternalNote(adminId: string, ticketId: string, body: string) {
  const exists = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!exists) throw Errors.notFound('Ticket not found');
  const note = await prisma.ticketInternalNote.create({
    data: { ticketId, createdById: adminId, body },
    select: { id: true, body: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
  });
  void audit(adminId, 'note.added', 'ticket', ticketId, { noteId: note.id });
  return note; // never emitted to author rooms
}
