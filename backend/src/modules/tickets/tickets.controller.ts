import type { Request, Response } from 'express';
import { authorScope } from '../../middleware/rbac';
import { enqueueClassification } from '../../jobs/aiQueue';
import { classifyTicket } from '../ai/classification.service';
import { getOrCreateDraft } from '../ai/draft.service';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import type { AdminListQuery, AdminUpdateInput, CreateTicketInput } from './ticket.schemas';
import * as service from './ticket.service';

const id = (req: Request) => req.params.id as string;

// ---- author
export async function create(req: Request, res: Response) {
  const ticket = await service.createTicket(authorScope(req), req.user!.id, req.body as CreateTicketInput);
  res.status(201).json({ ticket }); // committed and answered first...
  enqueueClassification(ticket.id); // ...AI enrichment happens afterwards, asynchronously
}
export async function listMine(req: Request, res: Response) {
  res.json({ items: await service.listAuthorTickets(authorScope(req)) });
}
export async function getMine(req: Request, res: Response) {
  res.json({ ticket: await service.getAuthorTicket(authorScope(req), id(req)) });
}
export async function replyMine(req: Request, res: Response) {
  const result = await service.addAuthorMessage(authorScope(req), req.user!.id, id(req), (req.body as { body: string }).body);
  res.status(201).json(result);
}

// ---- admin
export async function adminList(req: Request, res: Response) {
  res.json(await service.listAdminTickets(req.user!.id, req.query as unknown as AdminListQuery));
}
export async function adminGet(req: Request, res: Response) {
  res.json({ ticket: await service.getAdminTicket(id(req)) });
}
export async function adminUpdate(req: Request, res: Response) {
  res.json({ ticket: await service.updateTicketAsAdmin(req.user!.id, id(req), req.body as AdminUpdateInput) });
}
export async function adminReply(req: Request, res: Response) {
  const result = await service.addAdminMessage(req.user!.id, id(req), (req.body as { body: string }).body);
  res.status(201).json(result);
}
export async function adminAddNote(req: Request, res: Response) {
  res.status(201).json({ note: await service.addInternalNote(req.user!.id, id(req), (req.body as { body: string }).body) });
}
export async function adminGetDraft(req: Request, res: Response) {
  // draft is null when the admin already replied and the author has not answered yet
  res.json(await getOrCreateDraft(id(req), req.user!.id, false));
}
export async function adminRegenerateDraft(req: Request, res: Response) {
  res.status(202).json(await getOrCreateDraft(id(req), req.user!.id, true));
}
// Manual retry when automatic classification failed (AI was down) or looks wrong.
export async function adminReclassify(req: Request, res: Response) {
  const ticket = await prisma.ticket.findUnique({ where: { id: id(req) }, select: { id: true } });
  if (!ticket) throw Errors.notFound('Ticket not found');
  await prisma.ticket.update({ where: { id: ticket.id }, data: { aiStatus: 'PENDING', aiError: null } });
  void classifyTicket(ticket.id);
  res.status(202).json({ status: 'PENDING' });
}

export async function getMyUnread(req: Request, res: Response) {
  res.json(await service.getAuthorUnread(authorScope(req)));
}
export async function markMineRead(req: Request, res: Response) {
  res.json(await service.markAuthorTicketRead(authorScope(req), id(req)));
}
export async function adminUnread(_req: Request, res: Response) {
  res.json(await service.getAdminUnread());
}
export async function adminMarkRead(req: Request, res: Response) {
  res.json(await service.markAdminTicketRead(req.user!.id, id(req)));
}
