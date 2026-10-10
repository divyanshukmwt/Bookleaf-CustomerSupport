import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Shell role="ADMIN" links={[{ href: '/admin', label: 'Ticket Queue' }, { href: '/admin/ai', label: 'AI Metrics' }]}>{children}</Shell>;
}
