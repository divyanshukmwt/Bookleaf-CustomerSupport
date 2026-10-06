import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../types/auth';
import { signSessionToken } from './session';

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

export async function login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const record = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true, author: { select: { id: true } } },
  });

  const passwordOk = await bcrypt.compare(password, record?.passwordHash ?? DUMMY_HASH);
  if (!record || !passwordOk || !record.isActive) {
    // One generic message for every failure reason (no account enumeration).
    throw Errors.unauthorized('Invalid email or password');
  }

  const user: AuthUser = {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    authorId: record.author?.id ?? null,
  };
  return { user, token: signSessionToken(user.id) };
}
