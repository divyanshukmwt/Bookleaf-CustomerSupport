'use client';

import { useEffect, useRef } from 'react';
import { fmtDateTime } from '@/lib/format';
import { seenAt } from '@/lib/messages';
import type { Message, Role } from '@/lib/types';

// perspective decides labels: authors see "You"/"BookLeaf Support"; admins see the author's name
// (and the admin who wrote a reply, which the server only sends to admins).
// `unreadFromId` places a "New messages" divider before the first message that was unread when the
// conversation was opened; it is captured by the page so the divider survives marking as read.
export function Conversation({ messages, perspective, authorName, unreadFromId }: {
  messages: Message[];
  perspective: Role;
  authorName?: string;
  unreadFromId?: string | null;
}) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const lastMineId = [...messages].reverse().find((m) => m.senderRole === perspective)?.id;
  const seen = seenAt(messages, perspective);

  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = m.senderRole === perspective;
        const fromAuthor = m.senderRole === 'AUTHOR';
        const label = mine
          ? 'You'
          : fromAuthor
            ? authorName ?? 'Author'
            : perspective === 'ADMIN' ? m.sender?.name ?? 'BookLeaf Support' : 'BookLeaf Support';
        const unread = !mine && !m.readAt;
        return (
          <li key={m.id}>
            {m.id === unreadFromId && (
              <div className="my-2 flex items-center gap-2 text-xs font-medium text-amber-700" role="separator" aria-label="New messages">
                <span className="h-px flex-1 bg-amber-300" />New messages<span className="h-px flex-1 bg-amber-300" />
              </div>
            )}
            <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  mine ? 'rounded-br-sm bg-brand-700 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900'
                } ${unread ? 'ring-2 ring-amber-400' : ''}`}
              >
                <div className={`mb-1 flex flex-wrap items-center gap-x-2 text-xs ${mine ? 'text-brand-100' : 'text-slate-500'}`}>
                  <span className="font-semibold">{label}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={m.createdAt}>{fmtDateTime(m.createdAt)}</time>
                  {unread && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">New</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
            {m.id === lastMineId && seen && (
              <p className={`mt-0.5 text-right text-[11px] text-slate-500`}>Seen {fmtDateTime(seen)}</p>
            )}
          </li>
        );
      })}
      <li ref={endRef} aria-hidden="true" />
    </ol>
  );
}
