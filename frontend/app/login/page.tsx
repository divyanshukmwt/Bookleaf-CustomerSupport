'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorBanner, inputClass } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.replace(user.role === 'ADMIN' ? '/admin' : '/author/books');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-indigo-700">BookLeaf</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Author Support &amp; Communication Portal</p>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <ErrorBanner message={error} />
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
              <input id="email" type="email" required autoComplete="username" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
              <input id="password" type="password" required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
