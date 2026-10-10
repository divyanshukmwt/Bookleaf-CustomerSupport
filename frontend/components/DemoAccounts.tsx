'use client';

import type { DemoAccount, DemoAccountsResponse } from '@/lib/demoAccounts';
import { ROLE_LABEL } from '@/lib/demoAccounts';

// Cards for the seeded demo accounts. Clicking one only fills the form so the evaluator can review it
// and press "Sign in"; it never signs in by itself and never bypasses the normal login.
export function DemoAccounts({ data, selected, onPick }: { data: DemoAccountsResponse; selected: string; onPick: (a: DemoAccount) => void }) {
  const groups: DemoAccount['role'][] = ['AUTHOR', 'ADMIN'];
  return (
    <section aria-labelledby="demo-heading" className="space-y-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p id="demo-heading" className="font-semibold">Evaluation mode</p>
        <p>Use the demo accounts below to explore the author portal, admin dashboard, ticket workflows, and AI-assisted support features. These shortcuts are provided only to simplify evaluation of the assignment; they fill the sign-in form with the seeded demo credentials.</p>
      </div>
      {groups.map((role) => {
        const items = data.accounts.filter((a) => a.role === role);
        if (items.length === 0) return null;
        return (
          <div key={role}>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{ROLE_LABEL[role]}</h2>
            <ul className="space-y-2">
              {items.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => onPick(a)}
                    aria-pressed={selected === a.email}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${selected === a.email ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                  >
                    <span className="block font-medium text-slate-900">{a.name}</span>
                    <span className="block text-xs text-slate-500">{a.email}</span>
                    <span className="mt-1 block text-xs text-slate-600">{a.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
