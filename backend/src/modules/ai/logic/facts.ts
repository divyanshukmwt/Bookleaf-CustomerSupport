import { formatDate, inr, latestQuarterPayout } from './format';
import type { BookFacts, Intent } from './types';

// Only the fields an intent actually needs are ever sent to the LLM (minimal, private context).
const FIELD_SETS: Partial<Record<Intent, (keyof BookFacts)[]>> = {
  SALES_FIGURES: ['status', 'totalCopiesSold', 'totalRoyaltyEarned', 'royaltyPaid', 'royaltyPending'],
  ROYALTY_STATUS: [
    'status', 'publicationDate', 'mrp', 'authorRoyaltyPerCopy', 'totalCopiesSold',
    'totalRoyaltyEarned', 'royaltyPaid', 'royaltyPending', 'lastRoyaltyPayoutDate',
  ],
  ROYALTY_CALCULATION: [
    'status', 'publicationDate', 'mrp', 'authorRoyaltyPerCopy', 'totalCopiesSold',
    'totalRoyaltyEarned', 'royaltyPaid', 'royaltyPending', 'lastRoyaltyPayoutDate',
  ],
  PRODUCTION_STATUS: ['status', 'publicationDate'],
  AVAILABILITY_ISSUE: ['status', 'publicationDate', 'availableOn'],
  ISBN_ISSUE: ['isbn', 'status', 'availableOn'],
  PRINT_QUALITY_ISSUE: ['status', 'printPartner'],
};

const LABELS: Record<keyof BookFacts, string> = {
  bookCode: 'Book code', // admin display only: no per-intent field list includes it, so it is never sent to the AI
  title: 'Title',
  isbn: 'ISBN',
  status: 'Status',
  publicationDate: 'Publication date',
  mrp: 'MRP',
  authorRoyaltyPerCopy: 'Author royalty per copy',
  totalCopiesSold: 'Total copies sold',
  totalRoyaltyEarned: 'Total royalty earned',
  royaltyPaid: 'Royalty paid',
  royaltyPending: 'Royalty pending',
  lastRoyaltyPayoutDate: 'Last royalty payout date',
  printPartner: 'Print partner',
  availableOn: 'Available on',
};

const MONEY = new Set<keyof BookFacts>(['mrp', 'authorRoyaltyPerCopy', 'totalRoyaltyEarned', 'royaltyPaid', 'royaltyPending']);

export const PAYOUT_THRESHOLD = 1000;
export const isInProduction = (b: Pick<BookFacts, 'status'>) => b.status.startsWith('In Production');

export interface FactBook {
  title: string;
  fields: { key: keyof BookFacts; label: string; value: string }[];
  notes: string[];
}

export interface Facts {
  authorFirstName: string;
  books: FactBook[];
  payout: { quarterEnd: string; deadline: string; deadlinePassed: boolean } | null;
}

function display(key: keyof BookFacts, book: BookFacts): string {
  const v = book[key];
  if (v === null || v === undefined) {
    if (key === 'lastRoyaltyPayoutDate') return 'No payout made yet';
    return 'Not applicable yet';
  }
  if (v instanceof Date) return formatDate(v);
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'Not listed on any platform';
  if (MONEY.has(key) && typeof v === 'number') return inr(v);
  return String(v);
}

function notesFor(intent: Intent, b: BookFacts): string[] {
  const notes: string[] = [];
  if (isInProduction(b)) {
    notes.push('This book is still in production: it has no sales, royalties or platform listings yet.');
    return notes;
  }
  if (intent === 'ROYALTY_STATUS' || intent === 'ROYALTY_CALCULATION') {
    if (b.royaltyPending === 0) notes.push('No royalty is currently pending for this book.');
    else if (b.royaltyPending < PAYOUT_THRESHOLD)
      notes.push(`Pending royalty is below the ${inr(PAYOUT_THRESHOLD)} minimum payout threshold, so it rolls over to the next quarter.`);
    else if (!b.lastRoyaltyPayoutDate) notes.push('Pending royalty meets the payout threshold but no payout has been made yet for this book.');
  }
  return notes;
}

export function buildFacts(intent: Intent, books: BookFacts[], authorFirstName: string, now: Date): Facts {
  const fields = FIELD_SETS[intent] ?? [];
  const factBooks: FactBook[] = books.map((b) => ({
    title: b.title,
    fields: fields.map((key) => ({ key, label: LABELS[key], value: display(key, b) })),
    notes: notesFor(intent, b),
  }));

  let payout: Facts['payout'] = null;
  if (intent === 'ROYALTY_STATUS' || intent === 'ROYALTY_CALCULATION') {
    const q = latestQuarterPayout(now);
    payout = { quarterEnd: formatDate(q.quarterEnd), deadline: formatDate(q.deadline), deadlinePassed: q.deadlinePassed };
  }
  return { authorFirstName, books: factBooks, payout };
}

// Human/LLM-readable rendering of the facts.
export function renderFacts(facts: Facts): string {
  const lines: string[] = [];
  for (const b of facts.books) {
    lines.push(`Book: "${b.title}"`);
    for (const f of b.fields) lines.push(`- ${f.label}: ${f.value}`);
    for (const n of b.notes) lines.push(`- Note: ${n}`);
    lines.push('');
  }
  if (facts.payout) {
    lines.push('Payout schedule (policy):');
    lines.push(`- Most recent completed quarter ended: ${facts.payout.quarterEnd}`);
    lines.push(`- Policy payout deadline for that quarter (45 days after quarter end): ${facts.payout.deadline}`);
    lines.push(`- Deadline already passed: ${facts.payout.deadlinePassed ? 'yes' : 'no'}`);
  }
  return lines.join('\n').trim();
}

// Everything the validator may treat as "known true" for this draft.
export interface AllowedValues {
  amounts: Set<number>;
  dates: Set<string>; // normalised "d month yyyy"
  isbns: Set<string>; // lowercase
  copies: Set<number>;
  hasPublished: boolean;
  hasInProduction: boolean;
}

export const normaliseDate = (d: Date): string => formatDate(d).toLowerCase();

export function collectAllowed(books: BookFacts[], intent: Intent, now: Date): AllowedValues {
  const amounts = new Set<number>([PAYOUT_THRESHOLD]);
  const dates = new Set<string>();
  const isbns = new Set<string>();
  const copies = new Set<number>();
  let pendingSum = 0;
  let earnedSum = 0;
  let paidSum = 0;
  for (const b of books) {
    for (const n of [b.mrp, b.authorRoyaltyPerCopy, b.totalRoyaltyEarned, b.royaltyPaid, b.royaltyPending]) {
      if (typeof n === 'number') amounts.add(n);
    }
    pendingSum += b.royaltyPending;
    earnedSum += b.totalRoyaltyEarned;
    paidSum += b.royaltyPaid;
    copies.add(b.totalCopiesSold);
    isbns.add(b.isbn.toLowerCase());
    if (b.publicationDate) dates.add(normaliseDate(b.publicationDate));
    if (b.lastRoyaltyPayoutDate) dates.add(normaliseDate(b.lastRoyaltyPayoutDate));
  }
  amounts.add(pendingSum).add(earnedSum).add(paidSum);
  if (intent === 'ROYALTY_STATUS' || intent === 'ROYALTY_CALCULATION') {
    const q = latestQuarterPayout(now);
    dates.add(normaliseDate(q.quarterEnd));
    dates.add(normaliseDate(q.deadline));
  }
  return {
    amounts,
    dates,
    isbns,
    copies,
    hasPublished: books.some((b) => !isInProduction(b)),
    hasInProduction: books.some(isInProduction),
  };
}
