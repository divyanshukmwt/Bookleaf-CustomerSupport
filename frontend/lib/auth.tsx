'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  socket: Socket | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  // One realtime connection per logged-in session. Polling first, then upgrade to WebSocket when
  // possible; if the upgrade is blocked it simply stays on long-polling.
  const userId = user?.id;
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userId) return;
    const s = io({ path: '/socket.io/', withCredentials: true });
    socketRef.current = s;
    setSocket(s);
    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [userId]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  return <Ctx.Provider value={{ user, loading, socket, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

// Subscribe to a realtime event for the lifetime of the component.
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const { socket } = useAuth();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (p: T) => ref.current(p);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
