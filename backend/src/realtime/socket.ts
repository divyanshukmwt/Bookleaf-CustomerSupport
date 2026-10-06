import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE, verifySessionToken } from '../modules/auth/session';

// Realtime is an enhancement: the database is the source of truth. Every emit is best-effort and
// wrapped so a socket problem can never fail the HTTP request that triggered it.
let io: Server | null = null;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function initRealtime(server: HttpServer): void {
  io = new Server(server, { path: '/socket.io', serveClient: false });

  // Same cookie-based auth as the REST API. Unauthenticated sockets are refused.
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      if (!token) return next(new Error('unauthorized'));
      const userId = verifySessionToken(token);
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
      if (!user || !user.isActive) return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Authors only ever join their own room; admins join the shared admin room.
    socket.join(socket.data.role === 'ADMIN' ? 'admins' : `user:${socket.data.userId}`);
    logger.debug({ event: 'socket.connected', userId: socket.data.userId, role: socket.data.role }, 'socket connected');
  });
}

function emit(room: string, event: string, payload: unknown): void {
  try {
    io?.to(room).emit(event, payload);
  } catch (err) {
    logger.warn({ err, event }, 'realtime emit failed (data is persisted)');
  }
}

export const realtime = {
  toAuthor: (authorUserId: string, event: string, payload: unknown) => emit(`user:${authorUserId}`, event, payload),
  toAdmins: (event: string, payload: unknown) => emit('admins', event, payload),
};
