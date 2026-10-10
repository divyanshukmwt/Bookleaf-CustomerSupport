import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/format';

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100';

export function Button({ variant = 'primary', loading, className = '', children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-3.5 w-3.5' : 'h-6 w-6 text-brand-600'}`} aria-label="Loading" />;
}

export function PageLoader() {
  return <div className="flex justify-center py-16"><Spinner /></div>;
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};
const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
};

const pill = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium';

export const StatusBadge = ({ status }: { status: string }) => <span className={`${pill} ${STATUS_STYLE[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
export const PriorityBadge = ({ priority }: { priority: string | null }) =>
  priority ? <span className={`${pill} ${PRIORITY_STYLE[priority] ?? ''}`}>{PRIORITY_LABEL[priority]}</span> : <span className="text-xs text-slate-500">Unclassified</span>;
export const Tag = ({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'red' | 'amber' | 'green' }) => {
  const tones = { slate: 'bg-slate-100 text-slate-600', indigo: 'bg-brand-100 text-brand-700', red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-green-100 text-green-700' };
  return <span className={`${pill} ${tones[tone]}`}>{children}</span>;
};

export function UnreadBadge({ count, label = 'unread' }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold leading-5 text-white" aria-label={`${count} ${label}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
