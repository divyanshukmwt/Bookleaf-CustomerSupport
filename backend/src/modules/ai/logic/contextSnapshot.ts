import type { Facts } from './facts';
import { CATEGORY_LABELS, type Category, type Intent, type Route } from './types';

// A record of exactly what was supplied to the draft step, stored with the draft so an admin can
// check the reply against the same facts and documents. Pure module: no database, no LLM.

export interface KbDocInput {
  id: string;
  slug: string;
  title: string;
  version: number;
  content: string;
}

export interface KbReference {
  docId: string;
  slug: string;
  title: string;
  version: number;
  heading: string; // the knowledge-base documents have no sub-headings, so this is the document title
  reason: string;
  totalEntries: number;
  fullDocumentSupplied: true; // the whole document was part of the prompt; excerpts are the most relevant entries
  excerpts: { entry: number; text: string; matched: boolean }[];
}

export type KbStatus = 'SUPPLIED' | 'NOT_REQUIRED' | 'NONE_FOUND';

export interface ContextSnapshot {
  schemaVersion: 1;
  scope: string;
  intent: Intent;
  category: Category | null;
  route: Route;
  books: { bookCode: string | null; title: string; status: string }[];
  facts: Facts | null;
  kb: { status: KbStatus; version: string; note: string | null; references: KbReference[] };
}

const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that', 'have', 'has', 'from', 'was', 'were', 'will', 'can', 'how', 'what', 'when', 'where', 'why', 'who', 'their', 'they', 'them', 'been', 'any', 'all', 'our', 'its', 'about', 'into', 'than', 'then', 'also', 'may', 'per', 'which', 'would', 'should', 'could', 'there', 'hello', 'dear', 'please', 'thanks', 'thank']);

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/i, '');
const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9₹]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 3),
  );

/** Splits a knowledge-base document into its bullet entries (continuation lines join the previous one). */
export function kbEntries(content: string): string[] {
  const out: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) out.push(line.slice(2).trim());
    else if (out.length) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}

const MAX_EXCERPTS = 3;

function reasonFor(doc: KbDocInput, category: Category | null, intent: Intent): string {
  const cat = CATEGORY_LABELS[category ?? 'GENERAL_INQUIRY'];
  return `Supplied because the ticket is handled as "${cat}" (intent ${intent}), and BookLeaf's fixed category mapping includes "${doc.title}" for it.`;
}

/**
 * One reference per document that was actually put in the prompt. Excerpts are the document entries that
 * share the most words with the author's message (plain word overlap; no embeddings). If nothing overlaps,
 * the first entries are shown and flagged as unmatched rather than presented as a precise citation.
 */
export function buildKbReferences(docs: KbDocInput[], input: { category: Category | null; intent: Intent; query: string }): KbReference[] {
  const q = tokens(input.query);
  return docs.map((doc) => {
    const entries = kbEntries(doc.content);
    const scored = entries.map((text, i) => ({ entry: i + 1, text, score: [...tokens(text)].filter((t) => q.has(t)).length }));
    const matched = scored.filter((e) => e.score > 0).sort((a, b) => b.score - a.score || a.entry - b.entry).slice(0, MAX_EXCERPTS).sort((a, b) => a.entry - b.entry);
    const chosen = matched.length > 0 ? matched.map((e) => ({ entry: e.entry, text: e.text, matched: true })) : scored.slice(0, 2).map((e) => ({ entry: e.entry, text: e.text, matched: false }));
    return {
      docId: doc.id,
      slug: doc.slug,
      title: doc.title,
      version: doc.version,
      heading: doc.title,
      reason: reasonFor(doc, input.category, input.intent),
      totalEntries: entries.length,
      fullDocumentSupplied: true as const,
      excerpts: chosen,
    };
  });
}

export function buildContextSnapshot(input: {
  scope: string;
  intent: Intent;
  category: Category | null;
  route: Route;
  books: { bookCode?: string | null; title: string; status: string }[];
  facts: Facts | null;
  kbDocs: KbDocInput[]; // the documents that were actually supplied (empty when none)
  kbVersion: string;
  kbExpected: boolean; // true when the route needed a knowledge-base document
  query: string;
}): ContextSnapshot {
  const references = buildKbReferences(input.kbDocs, { category: input.category, intent: input.intent, query: input.query });
  let status: KbStatus;
  let note: string | null = null;
  if (references.length > 0) status = 'SUPPLIED';
  else if (input.kbExpected) {
    status = 'NONE_FOUND';
    note = 'No supporting knowledge-base document was found for this query, so none was supplied.';
  } else {
    status = 'NOT_REQUIRED';
    note = input.route === 'DB_ONLY' ? 'Not used: this reply is built from database facts only.' : 'No knowledge-base document was supplied for this reply.';
  }
  return {
    schemaVersion: 1,
    scope: input.scope,
    intent: input.intent,
    category: input.category,
    route: input.route,
    books: input.books.map((b) => ({ bookCode: b.bookCode ?? null, title: b.title, status: b.status })),
    facts: input.facts,
    kb: { status, version: input.kbVersion, note, references },
  };
}
