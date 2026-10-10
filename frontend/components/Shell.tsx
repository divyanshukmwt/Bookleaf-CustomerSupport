'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth, useSocketEvent } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Button, PageLoader, UnreadBadge } from './ui';

// Client-side route guard + navigation shell. (The API enforces authorization; this is UX only.)
export function Shell({ role, links, children }: { role: Role; links: { href: string; label: string }[]; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== role) router.replace(user.role === 'ADMIN' ? '/admin' : '/author/books');
  }, [loading, user, role, router]);

  // Unread total for the nav badge. Counted by the server from stored read state; refreshed on socket
  // events (debounced) instead of polling.
  const ready = !loading && !!user && user.role === role;
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshUnread = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<{ total: number }>(role === 'ADMIN' ? '/admin/tickets/unread' : '/tickets/unread').then((r) => setUnread(r.total)).catch(() => undefined);
    }, 300);
  }, [role]);
  useEffect(() => { if (ready) refreshUnread(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [ready, refreshUnread]);
  useSocketEvent('ticket:message', refreshUnread);
  useSocketEvent('ticket:read', refreshUnread);
  useSocketEvent('ticket:updated', refreshUnread);

  if (loading || !user || user.role !== role) return <PageLoader />; // also narrows `user` for the JSX below
  const badgeHref = role === 'ADMIN' ? '/admin' : '/author/tickets';

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-brand-700">BookLeaf {role === 'ADMIN' ? 'Operations' : 'Author Portal'}</span>
          <nav className="flex flex-1 gap-1">
            {links.map((l) => {
              const active = pathname === l.href || (l.href !== '/admin' && pathname.startsWith(l.href));
              return (
                <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l.label}
                  {l.href === badgeHref && unread > 0 && <span className="ml-2 align-middle"><UnreadBadge count={unread} label="unread messages" /></span>}
                </Link>
              );
            })}
          </nav>
          <span className="hidden text-sm text-slate-500 sm:inline">{user.name}</span>
          <Button variant="secondary" onClick={() => void logout()}>Log out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
