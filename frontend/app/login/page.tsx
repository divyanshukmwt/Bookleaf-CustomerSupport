'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { DemoAccounts } from '@/components/DemoAccounts';
import { Button, Card, ErrorBanner, inputClass } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchDemoAccounts, type DemoAccountsResponse } from '@/lib/demoAccounts';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [demo, setDemo] = useState<DemoAccountsResponse | null>(null);

  // Evaluation mode only: the API answers 404 unless DEMO_LOGIN=true, and the page then shows no demo cards.
  useEffect(() => { void fetchDemoAccounts().then(setDemo); }, []);

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
      <div className={`w-full ${demo ? 'max-w-4xl' : 'max-w-sm'}`}>
        <h1 className="mb-1 text-center text-2xl font-bold text-brand-700">BookLeaf</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Author Support &amp; Communication Portal</p>
        <div className={demo ? 'grid items-start gap-6 md:grid-cols-2' : ''}>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <ErrorBanner message={error} />
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
              <input id="email" type="email" required autoComplete="username" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
              <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />Show password</label>
            </div>
            <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          </form>
        </Card>
        {demo && <DemoAccounts data={demo} selected={email} onPick={(a) => { setEmail(a.email); setPassword(a.password); setError(null); }} />}
        </div>
      </div>
    </div>
  );
}
