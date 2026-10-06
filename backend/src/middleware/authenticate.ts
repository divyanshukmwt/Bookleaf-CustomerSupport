import { asyncHandler } from '../lib/asyncHandler';
import { Errors } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE, verifySessionToken } from '../modules/auth/session';

// Protects every non-public route. Identity comes from the signed HTTP-only cookie; the user
// record is re-read from the database so a deactivated account loses access immediately.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) throw Errors.unauthorized();

  const userId = verifySessionToken(token);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, author: { select: { id: true } } },
  });
  if (!user || !user.isActive) throw Errors.unauthorized('Session is no longer valid');

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role, authorId: user.author?.id ?? null };
  next();
});
