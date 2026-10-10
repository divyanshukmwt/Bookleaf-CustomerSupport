import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { Errors } from '../../lib/errors';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { loginBody } from './auth.schemas';
import * as controller from './auth.controller';
import { env } from '../../config/env';
import { listDemoAccounts } from './demoAccounts.service';

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

// Evaluation quick-login. Disabled (404, as if it did not exist) unless DEMO_LOGIN=true. It returns the
// seeded demo credentials so the login form can pre-fill them, which is why it is opt-in, rate limited
// and never cached. Signing in still goes through the normal POST /auth/login.
const demoLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
authRouter.get(
  '/demo-accounts',
  demoLimiter,
  asyncHandler(async (_req, res) => {
    if (!env.demoLoginEnabled) throw Errors.notFound();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      note: 'Evaluation mode: these seeded demo accounts are provided to simplify assignment evaluation.',
      accounts: await listDemoAccounts(),
    });
  }),
);
