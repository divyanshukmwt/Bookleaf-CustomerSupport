'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(!user ? '/login' : user.role === 'ADMIN' ? '/admin' : '/author/books');
  }, [loading, user, router]);
  return <PageLoader />;
}
