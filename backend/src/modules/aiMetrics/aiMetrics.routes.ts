import { Router } from 'express';
import { asyncHandler as h } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { metricsQuery, runsQuery, type MetricsQuery, type RunsQuery } from './aiMetrics.schemas';
import { getMetrics, listRuns } from './aiMetrics.service';

// Admin-only: /api/v1/admin/ai
export const adminAiRouter = Router();
adminAiRouter.use(authenticate, requireAdmin);
adminAiRouter.get('/metrics', validate({ query: metricsQuery }), h(async (req, res) => { res.json(await getMetrics(req.query as unknown as MetricsQuery)); }));
adminAiRouter.get('/runs', validate({ query: runsQuery }), h(async (req, res) => { res.json(await listRuns(req.query as unknown as RunsQuery)); }));
