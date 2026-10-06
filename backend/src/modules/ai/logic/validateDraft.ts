import type { AllowedValues } from './facts';

export type Severity = 'error' | 'warning';
export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
}
export interface ValidationResult {
  status: 'PASSED' | 'FLAGGED' | 'REJECTED';
  issues: ValidationIssue[];
}

// Timelines that appear in the BookLeaf Knowledge Base. Anything else is flagged.
const KB_TIMELINES = new Set(['48 hours', '24-48 hours', '5-7 business days', '7-10 business days', '3-5 business days', '45 days']);

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS}),?\\s+(\\d{4})\\b`, 'gi');
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const AMOUNT_RE = /(?:₹|\bRs\.?\s?|\bINR\s?)\s?(\d[\d,]*(?:\.\d+)?)/gi;
const COPIES_RE = /(\d[\d,]*)\s+copies\b/gi;
const ISBN_RE = /\b97[89][-0-9X]{8,}\b/gi;
const TIMELINE_RE = /\b(\d+)\s*(?:[–—-]|to)\s*(\d+)\s*(business days|hours|days)\b|\b(\d+)\s*(business days|hours|days)\b/gi;

const toNumber = (s: string) => Number(s.replace(/,/g, ''));
const MONTH_NAMES = MONTHS.toLowerCase().split('|');

export interface ValidationInput {
  reply: string;
  allowed: AllowedValues;
  /** Author-written text: values the author stated themselves may be echoed back. */
  authorText: string;
  requiresTimeline: boolean;
}

function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(toNumber(m[0]));
  return out;
}

export function validateDraft({ reply, allowed, authorText, requiresTimeline }: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (severity: Severity, code: string, message: string) => issues.push({ severity, code, message });
  const authorNumbers = numbersIn(authorText);
  const authorLower = authorText.toLowerCase();

  if (reply.trim().length < 40) add('error', 'EMPTY_REPLY', 'The draft is empty or too short to send.');
  if (reply.length > 3000) add('warning', 'TOO_LONG', 'The draft is unusually long; consider trimming it.');

  for (const m of reply.matchAll(AMOUNT_RE)) {
    const n = toNumber(m[1]!);
    if (!allowed.amounts.has(n) && !authorNumbers.has(n)) {
      add('error', 'AMOUNT_NOT_IN_FACTS', `Amount ${m[0].trim()} does not match any figure in the database.`);
    }
  }

  for (const m of reply.matchAll(COPIES_RE)) {
    const n = toNumber(m[1]!);
    if (!allowed.copies.has(n) && !authorNumbers.has(n)) {
      add('error', 'COPIES_MISMATCH', `"${m[0]}" does not match the copies sold on record.`);
    }
  }

  for (const m of reply.matchAll(DATE_RE)) {
    const key = `${Number(m[1])} ${m[2]!.toLowerCase()} ${m[3]}`;
    if (!allowed.dates.has(key) && !authorLower.includes(m[2]!.toLowerCase())) {
      add('error', 'DATE_NOT_IN_FACTS', `Date "${m[0]}" is not supported by the database or policy schedule.`);
    }
  }
  for (const m of reply.matchAll(ISO_RE)) {
    const monthName = MONTH_NAMES[Number(m[2]) - 1];
    const key = monthName ? `${Number(m[3])} ${monthName} ${m[1]}` : '';
    if (!allowed.dates.has(key)) add('error', 'DATE_NOT_IN_FACTS', `Date "${m[0]}" is not supported by the database or policy schedule.`);
  }

  for (const m of reply.matchAll(ISBN_RE)) {
    if (!allowed.isbns.has(m[0].toLowerCase()) && !authorLower.includes(m[0].toLowerCase())) {
      add('error', 'ISBN_NOT_IN_FACTS', `ISBN "${m[0]}" does not match the ISBN on record.`);
    }
  }

  if (allowed.hasInProduction && !allowed.hasPublished && /\b(is|are|now|already)\s+(published|live)\b/i.test(reply)) {
    add('error', 'STATUS_CONTRADICTION', 'The draft says the book is live/published but the database shows it is still in production.');
  }
  if (allowed.hasPublished && !allowed.hasInProduction && /\bstill in (production|typesetting|cover design|proofreading)\b/i.test(reply)) {
    add('error', 'STATUS_CONTRADICTION', 'The draft says the book is still in production but the database shows it is published.');
  }

  let foundTimeline = false;
  for (const m of reply.matchAll(TIMELINE_RE)) {
    foundTimeline = true;
    const normalised = m[1] ? `${m[1]}-${m[2]} ${m[3]!.toLowerCase()}` : `${m[4]} ${m[5]!.toLowerCase()}`;
    if (!KB_TIMELINES.has(normalised) && !authorNumbers.has(Number(m[1] ?? m[4]))) {
      add('warning', 'TIMELINE_NOT_IN_KB', `Timeline "${m[0]}" does not appear in the Knowledge Base.`);
    }
  }
  if (requiresTimeline && !foundTimeline) {
    add('warning', 'MISSING_TIMELINE', 'This type of issue should include a clear timeline from the Knowledge Base.');
  }

  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(reply) && !/[\w.+-]+@[\w-]+\.[\w.]+/.test(authorText)) {
    add('warning', 'EMAIL_IN_DRAFT', 'The draft contains an email address that was not provided by the author.');
  }

  const tail = reply.slice(-450);
  if (!/(next step|please (reply|share|send|let us know|confirm)|we(?:'ll| will)|our team will|you can|feel free|let us know|reply (here|to this))/i.test(tail)) {
    add('warning', 'MISSING_NEXT_STEP', 'The draft does not end with a clear next step.');
  }

  const status = issues.some((i) => i.severity === 'error') ? 'REJECTED' : issues.length ? 'FLAGGED' : 'PASSED';
  return { status, issues };
}
