// Read/unread rules, kept free of the database so they can be tested. A message is unread while
// `readAt` is null. The recipient is always the other side of the conversation:
//   author messages are read by BookLeaf staff (any admin opening the ticket marks them read for the team),
//   admin messages are read by the ticket's author.
export type MessageRole = 'AUTHOR' | 'ADMIN';

export const senderRoleToMark = (readerRole: MessageRole): MessageRole => (readerRole === 'AUTHOR' ? 'ADMIN' : 'AUTHOR');

export interface UnreadGroup { ticketId: string; count: number }

export function toUnreadMap(groups: UnreadGroup[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) if (g.count > 0) out[g.ticketId] = (out[g.ticketId] ?? 0) + g.count;
  return out;
}

export const unreadTotal = (map: Record<string, number>): number => Object.values(map).reduce((n, c) => n + c, 0);
