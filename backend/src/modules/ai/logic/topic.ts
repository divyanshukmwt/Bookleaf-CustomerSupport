import { DEFAULT_INTENT, resolveIntent } from './routing';
import type { Category, Intent } from './types';

// Cheap keyword topic detector used for follow-up messages (no LLM call per message).
// "Forget that. My book is unavailable on Amazon." -> DISTRIBUTION_AVAILABILITY.
const RULES: { category: Category; pattern: RegExp }[] = [
  { category: 'ROYALTY_PAYMENTS', pattern: /royalt|payout|payment|\bpaid\b|bank (transfer|detail|account)|earning/gi },
  { category: 'ISBN_METADATA', pattern: /\bisbn\b|metadata|wrong book|duplicate/gi },
  { category: 'PRINTING_QUALITY', pattern: /\bprint(ing|ed)?\b|misprint|binding|blurry|misalign|reprint|defect|colou?r/gi },
  {
    category: 'DISTRIBUTION_AVAILABILITY',
    pattern: /unavailable|out of stock|not (showing|listed|available)|stock sync|listing|amazon|flipkart|re-?sync/gi,
  },
  {
    category: 'PRODUCTION_UPDATES',
    pattern: /typesetting|cover design|proofread|in production|manuscript|when will|how long|still in|editing stage/gi,
  },
];

export function detectTopic(text: string): Category | null {
  const scores = RULES.map((r) => ({ category: r.category, hits: (text.match(r.pattern) ?? []).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (scores.length === 0) return null;
  if (scores.length > 1 && scores[0]!.hits === scores[1]!.hits) return null; // ambiguous -> don't guess
  return scores[0]!.category;
}

// Intent refinement inside the ticket's own category. The stored intent comes from the FIRST message,
// so a later message in the same category can need more sources than that intent routes to (sales
// figures -> "when will I be paid?"). Upgrade-only: a rule can move a DB-only intent to a richer one
// (which pulls in the Knowledge Base) but nothing here ever downgrades an intent to DB_ONLY.
const UPGRADES: { category: Category; from: Intent; to: Intent; pattern: RegExp }[] = [
  { category: 'ROYALTY_PAYMENTS', from: 'SALES_FIGURES', to: 'ROYALTY_STATUS', pattern: /royalt|\bpaid\b|\bpay(ment|ments|out|outs)?\b|pending|\bowed\b/i },
];

export function refineIntent(category: Category, intent: Intent, latestAuthorMessage: string): Intent {
  const rule = UPGRADES.find((r) => r.category === category && r.from === intent && r.pattern.test(latestAuthorMessage));
  return rule ? rule.to : intent;
}

// Scope of the LATEST author message, decided deterministically (no LLM) BEFORE any author data or
// Knowledge Base text is fetched.
//   IN_SCOPE      the message mentions BookLeaf support subject matter
//   CONTINUATION  a short follow-up ("why?", "any update on that?") that clearly leans on the history
//   UNCLEAR       too short/vague to act on -> manual review, no draft, no author data
//   OUT_OF_SCOPE  substantive but unrelated to BookLeaf -> polite redirect template, no author data
export type Scope = 'IN_SCOPE' | 'CONTINUATION' | 'UNCLEAR' | 'OUT_OF_SCOPE';

// Positive allow-list of BookLeaf support vocabulary (a superset of the topic rules above plus
// account/general terms). Anything outside it is not assumed to belong to the ticket's old topic.
const DOMAIN_VOCAB =
  /\b(book|author|royalt|payout|pay|paid|payment|bank|earn|sale|sales|sold|copy|copies|copyright|revenue|isbn|metadata|print|binding|cover|typeset|proofread|manuscript|publish|production|edition|amazon|flipkart|listing|store|stock|availab|distribut|account|login|password|profile|bio|email|invoice|tax|tds|refund|order|deliver|ship|dashboard|ticket|support|bookleaf|title|genre|mrp|price|platform|contract|agreement|reprint|isbn)/i;

// Anaphora / acknowledgement markers: only meaningful on SHORT messages.
const CONTINUATION = /\b(that|this|it|those|these|same|again|still|why|when|update|news|thanks?|thank you|ok|okay|please|also|more)\b/i;
const MAX_CONTINUATION_WORDS = 6;
const MIN_SUBSTANTIVE_WORDS = 4;

export function assessScope(text: string, opts: { allowContinuation: boolean }): Scope {
  if (detectTopic(text) || DOMAIN_VOCAB.test(text)) return 'IN_SCOPE';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (opts.allowContinuation && words <= MAX_CONTINUATION_WORDS && CONTINUATION.test(text)) return 'CONTINUATION';
  return words < MIN_SUBSTANTIVE_WORDS ? 'UNCLEAR' : 'OUT_OF_SCOPE';
}

export interface ResolvedTopic {
  category: Category | null;
  intent: Intent;
  changed: boolean; // true when the latest author message moved to a different topic
  scope: Scope;
}

// The current author message takes precedence over the original classification.
export function resolveTopic(input: {
  ticketCategory: Category | null;
  ticketIntent: Intent | null;
  latestAuthorMessage: string;
  isFirstMessage: boolean;
  subject?: string; // only used to judge scope of the first message
}): ResolvedTopic {
  const { ticketCategory, ticketIntent, latestAuthorMessage, isFirstMessage, subject } = input;
  const detected = detectTopic(latestAuthorMessage);
  const unrelated = (scope: Scope): ResolvedTopic => ({ category: null, intent: 'OTHER', changed: false, scope });

  // First message: trust the AI classification when it chose a specific support category. If the AI
  // was unavailable or filed it as GENERAL_INQUIRY, the scope gate still protects author data.
  if (isFirstMessage) {
    const specific = ticketCategory !== null && ticketCategory !== 'GENERAL_INQUIRY';
    if (!specific) {
      const scope = assessScope(`${subject ?? ''}\n${latestAuthorMessage}`, { allowContinuation: false });
      if (scope === 'UNCLEAR' || scope === 'OUT_OF_SCOPE') return unrelated(scope);
    }
    if (!ticketCategory) return { category: detected, intent: resolveIntent(detected, null), changed: false, scope: 'IN_SCOPE' };
    return { category: ticketCategory, intent: resolveIntent(ticketCategory, ticketIntent), changed: false, scope: 'IN_SCOPE' };
  }

  // Follow-up: a clear topic change always wins (existing behaviour).
  if (detected && detected !== ticketCategory) {
    return { category: detected, intent: DEFAULT_INTENT[detected], changed: true, scope: 'IN_SCOPE' };
  }

  // Otherwise the message must be on-topic, or a clear continuation, to inherit ticket metadata.
  const scope = assessScope(latestAuthorMessage, { allowContinuation: true });
  if (scope === 'UNCLEAR' || scope === 'OUT_OF_SCOPE') return unrelated(scope);

  // No classification yet (e.g. AI was down): fall back to keywords so admins still get a draft.
  if (!ticketCategory) return { category: detected, intent: resolveIntent(detected, null), changed: false, scope };

  const intent = resolveIntent(ticketCategory, ticketIntent);
  // Later in-scope messages may upgrade a stale intent (see UPGRADES above).
  return { category: ticketCategory, intent: refineIntent(ticketCategory, intent, latestAuthorMessage), changed: false, scope };
}