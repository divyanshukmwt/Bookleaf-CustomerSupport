// BookLeaf Knowledge Base, transcribed from the assignment brief.
// Seeded into the `knowledge_documents` table; the app reads it from the database at runtime.
import type { Category } from '../ai/logic/types';

export interface KbDocument {
  slug: string;
  title: string;
  content: string;
}

export const KB_DOCUMENTS: KbDocument[] = [
  {
    slug: 'company-overview',
    title: 'Company Overview',
    content: `- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).
- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for authors.
- The in-house printing facility and warehouse are in Delhi. Print partners include Repro India and Epitome Books.`,
  },
  {
    slug: 'royalty-policy',
    title: 'Royalty Policy',
    content: `- 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter.
- Payouts are made via bank transfer to the account linked in the author's dashboard.
- Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.`,
  },
  {
    slug: 'isbn-policy',
    title: 'ISBN Policy',
    content: `- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.
- ISBNs are registered under BookLeaf's publisher imprint. An author who wants an ISBN under their own imprint must obtain it independently.
- If an author reports an ISBN error (duplicate, wrong book linked), it is treated as a high-priority issue and escalated to the production team.`,
  },
  {
    slug: 'printing-quality',
    title: 'Printing & Quality',
    content: `- In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- If an author reports a quality issue (misprints, binding defects, color inconsistency), BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.`,
  },
  {
    slug: 'distribution-availability',
    title: 'Distribution & Availability',
    content: `- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.
- New listings typically go live within 7-10 business days after publication is complete.
- If a book shows as unavailable on a platform, it usually indicates a stock sync issue. BookLeaf's team can trigger a re-sync within 24-48 hours.`,
  },
  {
    slug: 'production-stages',
    title: 'Production Stages',
    content: `- A book goes through these stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Authors are updated at each stage via email.
- Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,
  },
  {
    slug: 'general-faq',
    title: 'General FAQ',
    content: `- Metadata updates (for example a book description on Amazon after the book is live) can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3-5 business days.`,
  },
];

// Per-category calibration for the draft prompt, adapted from the brief's sample query/response table.
export const RESPONSE_GUIDANCE: Record<Category, string> = {
  ROYALTY_PAYMENTS:
    'Acknowledge the frustration. Explain the quarterly cycle and 45-day payout window using the payout schedule facts. If pending royalty is below the minimum threshold, explain the rollover. For low-amount concerns explain net profit (MRP minus printing, platform commission, shipping) and offer a detailed line-by-line breakdown without being defensive. If a payment is genuinely overdue per policy, own it and escalate with a 48-hour resolution timeline. Mention checking that bank details are linked.',
  ISBN_METADATA:
    'Treat ISBN errors as high priority and say so. Acknowledge it is a serious data issue, confirm escalation to the production team immediately, and give a 48-hour resolution timeline. For ISBN-under-own-imprint questions, explain the imprint policy.',
  PRINTING_QUALITY:
    'Apologise sincerely. Ask the author to share photos of the defective copies. Confirm BookLeaf will arrange a free reprint once verified, with a 5-7 business day timeline.',
  DISTRIBUTION_AVAILABILITY:
    'Explain this is typically a stock sync issue. Confirm the distribution team will trigger a re-sync and set the expectation of 24-48 hours. Reference which platforms the book is listed on from the facts. If the book is not yet published, explain the 7-10 business day go-live window.',
  PRODUCTION_UPDATES:
    'State the actual production status from the facts. If delayed, be honest about the typical reason (cover design awaiting author approval, proofreading revision rounds) without blaming the author; frame it collaboratively. Give a specific next step and timeline.',
  GENERAL_INQUIRY:
    'Answer directly from the Knowledge Base. Include the relevant process and timeline, and end with a clear next step.',
};
