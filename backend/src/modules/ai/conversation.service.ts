import { logger } from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { aiService } from './aiService';
import { parseSummary } from './logic/output';
import { buildSummaryUser, SUMMARY_PROMPT_VERSION, SUMMARY_SYSTEM } from './prompts';

// Conversations longer than this get a rolling summary instead of full history in the prompt.
export const SUMMARY_THRESHOLD = 8;
export const KEEP_RECENT = 4;

// Called lazily while generating a draft (never per message). Summarises only the messages that
// are older than the recent window and not yet covered. On any failure the draft simply proceeds
// with the recent window alone.
export async function ensureSummary(ticketId: string): Promise<{ summary: string | null; version: number }> {
  const state = await prisma.conversationState.findUnique({ where: { ticketId } });
  const current = { summary: state?.summary ?? null, version: state?.version ?? 1 };
  try {
    const messages = await prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, senderRole: true, body: true },
    });
    const older = messages.slice(0, -KEEP_RECENT);
    const boundary = older[older.length - 1];
    if (!boundary || !aiService.isConfigured) return current;
    if (state?.summarizedThroughMessageId === boundary.id && state.summary) return current;

    const coveredIdx = state?.summarizedThroughMessageId ? older.findIndex((m) => m.id === state.summarizedThroughMessageId) : -1;
    const fresh = older.slice(coveredIdx + 1);
    const lines = fresh.map((m) => `[${m.senderRole === 'AUTHOR' ? 'Author' : 'BookLeaf'}] ${m.body.slice(0, 1000)}`);

    const { value } = await aiService.run({
      ticketId,
      operation: 'SUMMARY',
      promptVersion: SUMMARY_PROMPT_VERSION,
      system: SUMMARY_SYSTEM,
      user: buildSummaryUser(state?.summary ?? null, lines),
      maxOutputTokens: 300,
      temperature: 0,
      parse: parseSummary,
    });

    const updated = await prisma.conversationState.update({
      where: { ticketId },
      data: { summary: value, summarizedThroughMessageId: boundary.id, version: { increment: 1 } },
    });
    return { summary: updated.summary, version: updated.version };
  } catch (err) {
    logger.warn({ event: 'ai.summary.failed', ticketId, err: err instanceof Error ? err.message : 'error' }, 'summary skipped');
    return current;
  }
}
