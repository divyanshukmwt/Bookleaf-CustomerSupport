import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';

export default function AuthorLayout({ children }: { children: ReactNode }) {
  return (
    <Shell role="AUTHOR" links={[{ href: '/author/books', label: 'My Books' }, { href: '/author/tickets', label: 'My Tickets' }, { href: '/author/tickets/new', label: 'New Query' }]}>
      {children}
    </Shell>
  );
}
