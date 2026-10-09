'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorBanner, PageLoader, Tag } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, inr } from '@/lib/format';
import type { Book } from '@/lib/types';

const NA = <span className="text-slate-400">Not applicable yet</span>;

export default function BooksPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: Book[] }>('/books').then((r) => setBooks(r.items)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!books) return <PageLoader />;
  if (books.length === 0) return <EmptyState title="No books yet" hint="Books appear here once they are added to your BookLeaf account." />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Books</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {books.map((b) => {
          const inProduction = b.status.startsWith('In Production');
          return (
            <Card key={b.id}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{b.title}</h3>
                  <p className="text-xs text-slate-500">{b.genre}</p>
                </div>
                <Tag tone={inProduction ? 'amber' : 'green'}>{b.status}</Tag>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-xs text-slate-500">ISBN</dt><dd className="break-all">{b.isbn}</dd></div>
                <div><dt className="text-xs text-slate-500">Publication date</dt><dd>{b.publicationDate ? fmtDate(b.publicationDate) : NA}</dd></div>
                <div><dt className="text-xs text-slate-500">MRP</dt><dd>{b.mrp !== null ? inr(b.mrp) : NA}</dd></div>
                <div><dt className="text-xs text-slate-500">Copies sold</dt><dd>{inProduction ? NA : b.totalCopiesSold.toLocaleString('en-IN')}</dd></div>
                <div><dt className="text-xs text-slate-500">Royalty earned</dt><dd>{inProduction ? NA : inr(b.totalRoyaltyEarned)}</dd></div>
                <div><dt className="text-xs text-slate-500">Royalty paid</dt><dd>{inProduction ? NA : inr(b.royaltyPaid)}</dd></div>
                <div><dt className="text-xs text-slate-500">Royalty pending</dt><dd className={b.royaltyPending > 0 ? 'font-medium text-amber-700' : ''}>{inProduction ? NA : inr(b.royaltyPending)}</dd></div>
                <div><dt className="text-xs text-slate-500">Last payout</dt><dd>{inProduction ? NA : b.lastRoyaltyPayoutDate ? fmtDate(b.lastRoyaltyPayoutDate) : <span className="text-slate-500">No payout yet</span>}</dd></div>
              </dl>
              {inProduction && <p className="mt-3 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">This book is still in production. Sales and royalty details will appear after it is published.</p>}
              <div className="mt-3 text-right">
                <Link href="/author/tickets/new" className="text-xs font-medium text-indigo-600 hover:underline">Ask a question about this book →</Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
