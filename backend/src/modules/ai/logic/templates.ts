import { inr } from './format';
import { isInProduction } from './facts';
import type { BookFacts } from './types';

const SIGN_OFF = 'Warm regards,\nBookLeaf Author Support';

// Deterministic reply for DB_ONLY questions (sales figures): no LLM call, no cost, no hallucination.
export function salesTemplate(firstName: string, books: BookFacts[]): string {
  const parts = books.map((b) => {
    if (isInProduction(b)) {
      return `"${b.title}" is currently in production (${b.status.replace('In Production - ', '')}), so it has not been published yet and has no sales to report.`;
    }
    const copies = `${b.totalCopiesSold.toLocaleString('en-IN')} ${b.totalCopiesSold === 1 ? 'copy' : 'copies'}`;
    return `"${b.title}" has sold ${copies}, earning ${inr(b.totalRoyaltyEarned)} in royalties so far. Of that, ${inr(b.royaltyPaid)} has been paid out and ${inr(b.royaltyPending)} is pending.`;
  });
  return [
    `Hi ${firstName},`,
    'Thank you for reaching out. Here are the latest figures on your account:',
    parts.join('\n\n'),
    'A platform-wise sales breakdown is available in your dashboard. If you would like our team to walk you through it, just reply here and we will get back to you within 48 hours.',
    SIGN_OFF,
  ].join('\n\n');
}

// Reply for messages unrelated to BookLeaf support. Deliberately contains NO author data (no titles,
// figures, royalty or payment status): only the first name. No LLM, no database facts, no KB.
export function outOfScopeTemplate(firstName: string): string {
  return [
    `Hi ${firstName},`,
    "We're here to help with your BookLeaf account, book publishing, royalties, payments, and related queries. We're unable to assist with questions outside the scope of our support services. Is there anything related to your book or publishing journey that we can help you with?",
    SIGN_OFF,
  ].join('\n\n');
}
