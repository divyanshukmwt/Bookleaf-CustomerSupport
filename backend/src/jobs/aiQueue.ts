import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';
import { classifyTicket } from '../modules/ai/classification.service';

// Minimal in-process job runner (no Redis/BullMQ): a de-duplicated FIFO with bounded concurrency.
// Durability comes from the database: aiStatus on the ticket is the job state, and
// recoverStuckAiWork() re-queues anything left PENDING/PROCESSING after a crash or restart.
const MAX_CONCURRENCY = 2;
const waiting: string[] = [];
const queued = new Set<string>();
let running = 0;

function pump(): void {
  while (running < MAX_CONCURRENCY && waiting.length > 0) {
    const ticketId = waiting.shift()!;
    running++;
    classifyTicket(ticketId)
      .catch((err) => logger.error({ err, ticketId }, 'classification job crashed'))
      .finally(() => {
        running--;
        queued.delete(ticketId);
        pump();
      });
  }
}

export function enqueueClassification(ticketId: string): void {
  if (queued.has(ticketId)) return;
  queued.add(ticketId);
  waiting.push(ticketId);
  setImmediate(pump);
}

export async function recoverStuckAiWork(): Promise<void> {
  await prisma.ticket.updateMany({ where: { aiStatus: 'PROCESSING' }, data: { aiStatus: 'PENDING' } });
  const interrupted = await prisma.aiDraft.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'FAILED', error: 'Interrupted by a server restart. Click Regenerate to try again.' },
  });
  const pending = await prisma.ticket.findMany({ where: { aiStatus: 'PENDING' }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 200 });
  pending.forEach((t) => enqueueClassification(t.id));
  logger.info({ event: 'ai.recovery', requeuedTickets: pending.length, interruptedDrafts: interrupted.count }, 'startup AI recovery complete');
}
