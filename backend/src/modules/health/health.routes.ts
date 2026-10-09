import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

// Public by design (load balancers / uptime checks). Exposes no data.
export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is not reachable');
    }
    res.json({ status: 'ok' });
  }),
);
