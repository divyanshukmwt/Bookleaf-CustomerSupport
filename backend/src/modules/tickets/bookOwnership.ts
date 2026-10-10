import { Errors } from '../../lib/errors';

// Ownership check: the book must belong to this author. 404 (not 403) so ids can't be probed.
// Takes the minimal client shape so it can be tested without a database.
export async function assertAuthorOwnsBook(
  db: { book: { findFirst: (args: { where: { id: string; authorId: string }; select: { id: true } }) => Promise<{ id: string } | null> } },
  authorId: string,
  bookId: string,
): Promise<void> {
  const book = await db.book.findFirst({ where: { id: bookId, authorId }, select: { id: true } });
  if (!book) throw Errors.notFound('Book not found');
}
