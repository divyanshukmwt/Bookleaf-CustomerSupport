import type { Request, Response } from 'express';
import { logger } from '../../config/logger';
import type { LoginInput } from './auth.schemas';
import * as authService from './auth.service';
import { clearCookieOptions, SESSION_COOKIE, sessionCookieOptions } from './session';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput;
  const { user, token } = await authService.login(email, password);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  req.log.info({ event: 'auth.login', userId: user.id, role: user.role }, 'user logged in');
  res.status(200).json({ user });
}

export function logout(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());
  logger.info({ event: 'auth.logout', requestId: String(req.id) }, 'user logged out');
  res.status(204).end();
}

export function me(req: Request, res: Response) {
  res.status(200).json({ user: req.user });
}
