import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './docs/openapi';
import { adminAiRouter } from './modules/aiMetrics/aiMetrics.routes';
import { authRouter } from './modules/auth/auth.routes';
import { booksRouter } from './modules/books/books.routes';
import { healthRouter } from './modules/health/health.routes';
import { adminTicketsRouter, ticketsRouter } from './modules/tickets/tickets.routes';

// All API routes live under /api/v1. Every router except health/login/logout applies
// `authenticate` plus a role check (author routes: requireAuthor, admin routes: requireAdmin).
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/books', booksRouter);
apiRouter.use('/tickets', ticketsRouter);
apiRouter.use('/admin/tickets', adminTicketsRouter);
apiRouter.use('/admin/ai', adminAiRouter);

// API documentation (public, contains no data)
apiRouter.get('/openapi.json', (_req, res) => res.json(openapiSpec));
apiRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'BookLeaf API' }));
