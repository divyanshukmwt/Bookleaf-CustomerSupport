import { Router } from 'express';
import { asyncHandler as h } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireAdmin, requireAuthor } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as c from './tickets.controller';
import { adminListQuery, adminUpdateBody, createTicketBody, idParam, messageBody, noteBody } from './ticket.schemas';

// Author-facing: /api/v1/tickets (scoped to the logged-in author's own tickets)
export const ticketsRouter = Router();
ticketsRouter.use(authenticate, requireAuthor);
ticketsRouter.get('/', h(c.listMine));
ticketsRouter.post('/', validate({ body: createTicketBody }), h(c.create));
ticketsRouter.get('/unread', h(c.getMyUnread)); // before /:id
ticketsRouter.get('/:id', validate({ params: idParam }), h(c.getMine));
ticketsRouter.post('/:id/read', validate({ params: idParam }), h(c.markMineRead));
ticketsRouter.post('/:id/messages', validate({ params: idParam, body: messageBody }), h(c.replyMine));

// Admin-facing: /api/v1/admin/tickets
export const adminTicketsRouter = Router();
adminTicketsRouter.use(authenticate, requireAdmin);
adminTicketsRouter.get('/', validate({ query: adminListQuery }), h(c.adminList));
adminTicketsRouter.get('/unread', h(c.adminUnread)); // before /:id
adminTicketsRouter.get('/:id', validate({ params: idParam }), h(c.adminGet));
adminTicketsRouter.post('/:id/read', validate({ params: idParam }), h(c.adminMarkRead));
adminTicketsRouter.patch('/:id', validate({ params: idParam, body: adminUpdateBody }), h(c.adminUpdate));
adminTicketsRouter.post('/:id/messages', validate({ params: idParam, body: messageBody }), h(c.adminReply));
adminTicketsRouter.post('/:id/notes', validate({ params: idParam, body: noteBody }), h(c.adminAddNote));
adminTicketsRouter.get('/:id/draft', validate({ params: idParam }), h(c.adminGetDraft));
adminTicketsRouter.post('/:id/draft/regenerate', validate({ params: idParam }), h(c.adminRegenerateDraft));
adminTicketsRouter.post('/:id/classify', validate({ params: idParam }), h(c.adminReclassify));
