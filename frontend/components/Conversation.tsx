'use client';

import { useEffect, useRef } from 'react';
import { fmtDateTime } from '@/lib/format';
import type { Message } from '@/lib/types';

// perspective decides labels: authors see "You"/"BookLeaf Support"; admins see the author's name.
export function Conversation({ messages, perspective, authorName }: { messages: Message[]; perspective: 'AUTHOR' | 'ADMIN'; authorName?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const mine = m.senderRole === perspective;
        const label = m.senderRole === 'AUTHOR' ? (perspective === 'AUTHOR' ? 'You' : authorName ?? 'Author') : 'BookLeaf Support';
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.senderRole === 'ADMIN' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white'}`}>
              <div className={`mb-1 text-xs ${m.senderRole === 'ADMIN' ? 'text-indigo-100' : 'text-slate-500'}`}>
                {label} · {fmtDateTime(m.createdAt)}
              </div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
