'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Button, PageLoader } from './ui';

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

  if (loading || !user || user.role !== role) return <PageLoader />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:py-3.5">
          <span className="font-semibold text-indigo-700">BookLeaf {role === 'ADMIN' ? 'Operations' : 'Author Portal'}</span>
          <nav aria-label="Main navigation" className="flex flex-1 flex-wrap gap-1">
            {links.map((l) => {
              const active = pathname === l.href || (l.href !== '/admin' && pathname.startsWith(l.href));
              return (
                <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l.label}
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
