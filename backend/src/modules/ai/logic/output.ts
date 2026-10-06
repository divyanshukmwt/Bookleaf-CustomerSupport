import { CATEGORIES, INTENTS, PRIORITIES } from './types';
import type { Category, Intent, Priority } from './types';

// Extracts the first JSON object from model text (tolerates code fences / stray prose).
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface Classification {
  category: Category;
  priority: Priority;
  intent: Intent;
  confidence: number;
}

const oneOf = <T extends string>(allowed: readonly T[], v: unknown): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);

// Strict schema check: any deviation counts as malformed output (triggers the single retry).
export function parseClassification(text: string): Classification {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  if (!oneOf(CATEGORIES, raw.category)) throw new Error('Invalid category');
  if (!oneOf(PRIORITIES, raw.priority)) throw new Error('Invalid priority');
  if (!oneOf(INTENTS, raw.intent)) throw new Error('Invalid intent');
  const confidence = raw.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Invalid confidence');
  }
  return { category: raw.category, priority: raw.priority, intent: raw.intent, confidence };
}

export function parseDraftReply(text: string): string {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  if (typeof raw.reply !== 'string' || raw.reply.trim().length === 0 || raw.reply.length > 4000) {
    throw new Error('Invalid reply');
  }
  return raw.reply.trim();
}

export function parseSummary(text: string): string {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0 || raw.summary.length > 1500) {
    throw new Error('Invalid summary');
  }
  return raw.summary.trim();
}

const RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Business rule from the Knowledge Base: ISBN errors are always at least high priority.
export function applyPriorityFloor(intent: Intent, priority: Priority): Priority {
  if (intent === 'ISBN_ISSUE' && RANK[priority] > RANK.HIGH) return 'HIGH';
  return priority;
}
