import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { Errors } from '../../lib/errors';

export const SESSION_COOKIE = 'bookleaf_session';

const ttlSeconds = env.SESSION_TTL_HOURS * 60 * 60;

// The token carries only the user id. Role/active state are read from the database on every
// request, so they can never be stale or forged inside the token.
export function signSessionToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { algorithm: 'HS256', subject: userId, expiresIn: ttlSeconds });
}

export function verifySessionToken(token: string): string {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') throw new Error('malformed token');
    return decoded.sub;
  } catch {
    throw Errors.unauthorized('Invalid or expired session');
  }
}

// HttpOnly: not readable by JS (XSS can't steal it). SameSite=Lax: not sent on cross-site POSTs
// (CSRF defence; the app is single-origin so Lax never gets in the way). Secure in production.
const baseCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.cookieSecure,
  path: '/',
};

export const sessionCookieOptions = (): CookieOptions => ({ ...baseCookie, maxAge: ttlSeconds * 1000 });
export const clearCookieOptions = (): CookieOptions => ({ ...baseCookie });
