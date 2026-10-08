import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorScope, requireAuthor } from '../../middleware/rbac';

export const booksRouter = Router();

// Author-only: always scoped by the logged-in author's id. Books in production are included
// (nullable fields stay null; the UI renders them as "Not applicable yet").
booksRouter.get(
  '/',
  authenticate,
  requireAuthor,
  asyncHandler(async (req, res) => {
    const books = await prisma.book.findMany({
      where: { authorId: authorScope(req) },
      orderBy: { bookCode: 'asc' },
      select: {
        id: true, title: true, isbn: true, genre: true, publicationDate: true, status: true, mrp: true,
        totalCopiesSold: true, totalRoyaltyEarned: true, royaltyPaid: true, royaltyPending: true,
        lastRoyaltyPayoutDate: true, availableOn: true,
      },
    });
    res.json({ items: books });
  }),
);
