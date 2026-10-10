// Pure message helpers (no React) so de-duplication and unread rules can be unit-tested.
import type { Message, Role } from './types';

const byTime = (a: Message, b: Message) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1);

/**
 * Merges messages from any source (initial load, API response, socket event). A message id appears once:
 * if the same id arrives twice, the copy with more information (a readAt) wins. Order is chronological.
 */
export function mergeMessages(existing: Message[], incoming: Message | Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of existing) map.set(m.id, m);
  for (const m of Array.isArray(incoming) ? incoming : [incoming]) {
    const prev = map.get(m.id);
    map.set(m.id, prev ? { ...prev, ...m, readAt: m.readAt ?? prev.readAt } : m);
  }
  return [...map.values()].sort(byTime);
}

/** Messages the viewer has not read: sent by the other side and still without a readAt. */
export function unreadFor(messages: Message[], viewer: Role): Message[] {
  return messages.filter((m) => m.senderRole !== viewer && !m.readAt);
}

/** Id of the first unread incoming message, used to place the "New messages" divider. */
export const firstUnreadId = (messages: Message[], viewer: Role): string | null => unreadFor(messages, viewer)[0]?.id ?? null;

/** Marks incoming messages as read locally after the server confirmed it, keeping everything else. */
export function applyRead(messages: Message[], viewer: Role, readAt: string): Message[] {
  return messages.map((m) => (m.senderRole !== viewer && !m.readAt ? { ...m, readAt } : m));
}

/** When the other side has seen my newest message. */
export function seenAt(messages: Message[], viewer: Role): string | null {
  const mine = messages.filter((m) => m.senderRole === viewer);
  const last = mine[mine.length - 1];
  return last?.readAt ?? null;
}
