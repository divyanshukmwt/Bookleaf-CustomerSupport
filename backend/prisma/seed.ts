/**
 * Seeds the exact BookLeaf sample dataset (10 authors, 18 books), login accounts and the Knowledge Base.
 *
 * - Dataset values are inserted as-is: nothing is recalculated, defaulted or "fixed".
 *   null stays null (books in production have no MRP / publication date / print partner).
 * - Idempotent: safe to run repeatedly (upserts on authorCode / bookCode / email).
 *   Re-running refreshes dataset fields but does NOT reset existing user passwords.
 * - Passwords come from SEED_AUTHOR_PASSWORD / SEED_ADMIN_PASSWORD; nothing is hardcoded.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { KB_DOCUMENTS } from '../src/modules/knowledge/kb.content';

const prisma = new PrismaClient();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// Strict shape check so a malformed dataset fails loudly instead of seeding garbage.
const datasetSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string(),
      name: z.string(),
      email: z.string().email(),
      phone: z.string(),
      city: z.string(),
      joined_date: isoDate,
      books: z.array(
        z.object({
          book_id: z.string(),
          title: z.string(),
          isbn: z.string(),
          genre: z.string(),
          publication_date: isoDate.nullable(),
          status: z.string(),
          mrp: z.number().int().nullable(),
          author_royalty_per_copy: z.number().int().nullable(),
          total_copies_sold: z.number().int(),
          total_royalty_earned: z.number().int(),
          royalty_paid: z.number().int(),
          royalty_pending: z.number().int(),
          last_royalty_payout_date: isoDate.nullable(),
          print_partner: z.string().nullable(),
          available_on: z.array(z.string()),
        }),
      ),
    }),
  ),
});

// Dates are stored as calendar dates; parse as UTC midnight so the day never shifts with timezone.
const toDate = (value: string | null): Date | null => (value ? new Date(`${value}T00:00:00.000Z`) : null);

const ADMINS = [
  { email: 'admin@bookleaf.example', name: 'BookLeaf Admin' },
  { email: 'ops@bookleaf.example', name: 'BookLeaf Operations' },
];

function requirePassword(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(`${name} must be set (min 8 characters) to run the seed. See backend/.env.example.`);
  }
  // Demo accounts must not ship with the publicly known placeholder password in a production-mode deploy.
  if (process.env.NODE_ENV === 'production' && value.startsWith('replace-with')) {
    throw new Error(`${name} is still the .env.example placeholder; choose a real demo password.`);
  }
  return value;
}

async function main() {
  const authorPassword = requirePassword('SEED_AUTHOR_PASSWORD');
  const adminPassword = requirePassword('SEED_ADMIN_PASSWORD');
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  const file = path.join(__dirname, 'data', 'bookleaf_sample_data.json');
  const dataset = datasetSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

  const bookCount = dataset.authors.reduce((n, a) => n + a.books.length, 0);
  if (dataset.authors.length !== 10 || bookCount !== 18) {
    throw new Error(`Expected 10 authors / 18 books per the assignment, found ${dataset.authors.length} / ${bookCount}`);
  }

  // Hash before opening the transaction so slow bcrypt work can't trip the transaction timeout.
  const authorHashes = await Promise.all(dataset.authors.map(() => bcrypt.hash(authorPassword, rounds)));
  const adminHashes = await Promise.all(ADMINS.map(() => bcrypt.hash(adminPassword, rounds)));

  await prisma.$transaction(
    async (tx) => {
      for (const [i, admin] of ADMINS.entries()) {
        await tx.user.upsert({
          where: { email: admin.email },
          create: { email: admin.email, name: admin.name, role: Role.ADMIN, passwordHash: adminHashes[i]! },
          update: { name: admin.name },
        });
      }

      for (const [i, a] of dataset.authors.entries()) {
        const email = a.email.toLowerCase();
        const user = await tx.user.upsert({
          where: { email },
          create: { email, name: a.name, role: Role.AUTHOR, passwordHash: authorHashes[i]! },
          update: { name: a.name },
        });

        const authorData = { phone: a.phone, city: a.city, joinedDate: toDate(a.joined_date)! };
        const author = await tx.author.upsert({
          where: { authorCode: a.author_id },
          create: { authorCode: a.author_id, userId: user.id, ...authorData },
          update: authorData,
        });

        for (const b of a.books) {
          const bookData = {
            authorId: author.id,
            title: b.title,
            isbn: b.isbn,
            genre: b.genre,
            publicationDate: toDate(b.publication_date),
            status: b.status,
            mrp: b.mrp,
            authorRoyaltyPerCopy: b.author_royalty_per_copy,
            totalCopiesSold: b.total_copies_sold,
            totalRoyaltyEarned: b.total_royalty_earned,
            royaltyPaid: b.royalty_paid,
            royaltyPending: b.royalty_pending,
            lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date),
            printPartner: b.print_partner,
            availableOn: b.available_on,
          };
          await tx.book.upsert({
            where: { bookCode: b.book_id },
            create: { bookCode: b.book_id, ...bookData },
            update: bookData,
          });
        }
      }
    },
    { timeout: 60_000 },
  );

  // Knowledge Base: version only bumps when the content actually changes (keeps draft caches valid).
  for (const doc of KB_DOCUMENTS) {
    const existing = await prisma.knowledgeDocument.findUnique({ where: { slug: doc.slug } });
    if (!existing) {
      await prisma.knowledgeDocument.create({ data: doc });
    } else if (existing.content !== doc.content || existing.title !== doc.title) {
      await prisma.knowledgeDocument.update({ where: { slug: doc.slug }, data: { title: doc.title, content: doc.content, version: { increment: 1 } } });
    }
  }

  const [users, authors, books] = await Promise.all([prisma.user.count(), prisma.author.count(), prisma.book.count()]);
  // eslint-disable-next-line no-console
  const kb = await prisma.knowledgeDocument.count();
  // eslint-disable-next-line no-console
  console.log(`Seed complete: ${users} users, ${authors} authors, ${books} books, ${kb} knowledge documents.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
