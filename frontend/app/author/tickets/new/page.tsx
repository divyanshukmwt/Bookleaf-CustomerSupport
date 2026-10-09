'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ErrorBanner, inputClass, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Book } from '@/lib/types';

export default function NewTicketPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [bookId, setBookId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Book[] }>('/books').then((r) => setBooks(r.items)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // no duplicate submissions
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ticket: { id: string } }>('/tickets', { method: 'POST', body: { bookId: bookId || null, subject, description } });
      router.push(`/author/tickets/${r.ticket.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!books && !error) return <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Submit a support query</h1>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="book" className="mb-1 block text-sm font-medium">Which book is this about?</label>
            <select id="book" className={inputClass} value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={busy}>
              <option value="">General / Account Level</option>
              {books?.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="subject" className="mb-1 block text-sm font-medium">Subject</label>
            <input id="subject" required maxLength={200} className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} placeholder="e.g. Royalty not received" />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">Describe your query</label>
            <textarea id="description" required rows={7} maxLength={5000} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Share as much detail as you can: dates, amounts, platform names…" />
            <p className="mt-1 text-right text-xs text-slate-400">{description.length}/5000</p>
          </div>
          <div>
            <label htmlFor="files" className="mb-1 block text-sm font-medium">Attachments <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="files" type="file" multiple className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))} disabled={busy} />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">File upload isn&apos;t enabled yet, so {files.length === 1 ? 'this file' : 'these files'} won&apos;t be sent. If you have photos to share, reply to the ticket once our team asks for them.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy}>Submit query</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
