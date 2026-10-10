// Pure helpers for starting a query from a specific book. Kept free of React so they can be unit-tested.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts only a well-formed UUID; anything else (arrays, junk, empty) is ignored. */
export function parseBookParam(raw: string | string[] | null | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && UUID.test(v.trim()) ? v.trim() : null;
}

/** The param only counts if the book is one of the signed-in author's own books. */
export function resolveSelectedBook(raw: string | string[] | null | undefined, books: { id: string }[]): { bookId: string; status: 'ok' } | { bookId: ''; status: 'none' | 'invalid' } {
  const id = parseBookParam(raw);
  const present = raw !== null && raw !== undefined && (Array.isArray(raw) ? raw.length > 0 : raw !== '');
  if (!id) return { bookId: '', status: present ? 'invalid' : 'none' };
  return books.some((b) => b.id === id) ? { bookId: id, status: 'ok' } : { bookId: '', status: 'invalid' };
}

export const bookQueryHref = (bookId: string) => `/author/tickets/new?bookId=${encodeURIComponent(bookId)}`;

/** Payload sent to POST /tickets. No category: the AI classifies the ticket from subject and description. */
export function buildTicketPayload(f: { bookId: string; subject: string; description: string }) {
  return { bookId: f.bookId || null, subject: f.subject.trim(), description: f.description.trim() };
}
