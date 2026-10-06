import type { Request, RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { logger } from '../config/logger';
import { Errors } from '../lib/errors';

// Role gate. Must run after `authenticate`.
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!allowed.includes(req.user.role)) {
      logger.warn(
        { event: 'authz.denied', userId: req.user.id, role: req.user.role, method: req.method, path: req.originalUrl },
        'role not permitted for route',
      );
      return next(Errors.forbidden());
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireAuthor = requireRole('AUTHOR');

// Every author-facing query must be scoped with this id (ownership isolation).
// Author-owned lookups should filter `where: { id, authorId: authorScope(req) }`
// and answer 404 when nothing matches.
export function authorScope(req: Request): string {
  if (!req.user || req.user.role !== 'AUTHOR' || !req.user.authorId) throw Errors.forbidden();
  return req.user.authorId;
}
