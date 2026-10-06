import type { Category, Intent, Route } from './types';

// Which intents are plausible for each category. If an admin overrides the category, an AI intent
// that no longer fits is discarded and replaced by the category default (deterministic, no LLM).
const COMPATIBLE: Record<Category, Intent[]> = {
  ROYALTY_PAYMENTS: ['ROYALTY_STATUS', 'ROYALTY_CALCULATION', 'SALES_FIGURES', 'POLICY_QUESTION'],
  ISBN_METADATA: ['ISBN_ISSUE', 'METADATA_UPDATE', 'POLICY_QUESTION'],
  PRINTING_QUALITY: ['PRINT_QUALITY_ISSUE', 'POLICY_QUESTION'],
  DISTRIBUTION_AVAILABILITY: ['AVAILABILITY_ISSUE', 'POLICY_QUESTION'],
  PRODUCTION_UPDATES: ['PRODUCTION_STATUS', 'POLICY_QUESTION'],
  GENERAL_INQUIRY: ['POLICY_QUESTION', 'METADATA_UPDATE', 'SALES_FIGURES', 'OTHER'],
};

export const DEFAULT_INTENT: Record<Category, Intent> = {
  ROYALTY_PAYMENTS: 'ROYALTY_STATUS',
  ISBN_METADATA: 'ISBN_ISSUE',
  PRINTING_QUALITY: 'PRINT_QUALITY_ISSUE',
  DISTRIBUTION_AVAILABILITY: 'AVAILABILITY_ISSUE',
  PRODUCTION_UPDATES: 'PRODUCTION_STATUS',
  GENERAL_INQUIRY: 'OTHER',
};

export function resolveIntent(category: Category | null, intent: Intent | null): Intent {
  if (intent && (!category || COMPATIBLE[category].includes(intent))) return intent;
  return category ? DEFAULT_INTENT[category] : 'OTHER';
}

// DB is the source of truth for author/book facts, the KB for policy. The route says which
// sources the answer needs - and therefore whether an LLM is needed at all.
export function routeFor(intent: Intent, bookCount: number): Route {
  const hasBooks = bookCount > 0;
  switch (intent) {
    case 'SALES_FIGURES':
      return hasBooks ? 'DB_ONLY' : 'INSUFFICIENT_INFORMATION';
    case 'ROYALTY_STATUS':
    case 'ROYALTY_CALCULATION':
    case 'PRODUCTION_STATUS':
    case 'AVAILABILITY_ISSUE':
    case 'ISBN_ISSUE':
      return hasBooks ? 'HYBRID' : 'INSUFFICIENT_INFORMATION';
    case 'PRINT_QUALITY_ISSUE':
      return hasBooks ? 'HYBRID' : 'KB_ONLY';
    case 'POLICY_QUESTION':
    case 'METADATA_UPDATE':
      return 'KB_ONLY';
    default:
      return 'INSUFFICIENT_INFORMATION';
  }
}

// Deterministic category -> Knowledge Base section mapping (no search/embeddings needed).
export function kbSlugsFor(category: Category, intent: Intent): string[] {
  switch (category) {
    case 'ROYALTY_PAYMENTS':
      return ['royalty-policy'];
    case 'ISBN_METADATA':
      return intent === 'METADATA_UPDATE' ? ['isbn-policy', 'general-faq'] : ['isbn-policy'];
    case 'PRINTING_QUALITY':
      return ['printing-quality'];
    case 'DISTRIBUTION_AVAILABILITY':
      return ['distribution-availability'];
    case 'PRODUCTION_UPDATES':
      return ['production-stages'];
    default:
      return intent === 'METADATA_UPDATE' ? ['general-faq'] : ['company-overview', 'general-faq'];
  }
}
