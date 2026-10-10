// Dependency-free domain types/constants shared by the AI logic. Pure module: no imports,
// so it can be unit-tested and reasoned about in isolation. String unions mirror the Prisma enums.

export const CATEGORIES = [
  'ROYALTY_PAYMENTS',
  'ISBN_METADATA',
  'PRINTING_QUALITY',
  'DISTRIBUTION_AVAILABILITY',
  'PRODUCTION_UPDATES',
  'GENERAL_INQUIRY',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  PRODUCTION_UPDATES: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INTENTS = [
  'SALES_FIGURES',
  'ROYALTY_STATUS',
  'ROYALTY_CALCULATION',
  'PRODUCTION_STATUS',
  'AVAILABILITY_ISSUE',
  'ISBN_ISSUE',
  'PRINT_QUALITY_ISSUE',
  'POLICY_QUESTION',
  'METADATA_UPDATE',
  'OTHER',
] as const;
export type Intent = (typeof INTENTS)[number];

export type Route = 'DB_ONLY' | 'KB_ONLY' | 'HYBRID' | 'INSUFFICIENT_INFORMATION';

export interface BookFacts {
  bookCode?: string; // dataset code such as BK001; shown to admins only, never sent to the AI
  title: string;
  isbn: string;
  status: string;
  publicationDate: Date | null;
  mrp: number | null;
  authorRoyaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: Date | null;
  printPartner: string | null;
  availableOn: string[];
}
