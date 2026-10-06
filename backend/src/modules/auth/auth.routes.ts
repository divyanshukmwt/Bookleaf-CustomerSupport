import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { Errors } from '../../lib/errors';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { loginBody } from './auth.schemas';
import * as controller from './auth.controller';

// Brute-force protection on login: 10 failed attempts per IP per 15 minutes
// (successful logins don't count). In-memory store is fine for a single instance.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.tooManyRequests('Too many failed login attempts. Try again in 15 minutes.')),
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate({ body: loginBody }), asyncHandler(controller.login));
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
