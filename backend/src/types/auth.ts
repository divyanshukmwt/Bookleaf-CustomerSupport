import type { Role } from '@prisma/client';

// The authenticated principal attached to req.user. Built from the database on every request,
// so deactivation and role changes take effect immediately.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Set only for AUTHOR users. All author data access is scoped by this id. */
  authorId: string | null;
}
