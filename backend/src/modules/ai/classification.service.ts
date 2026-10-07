import { logger } from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { realtime } from '../../realtime/socket';
import { AiError, aiService } from './aiService';
import { applyPriorityFloor, parseClassification } from './logic/output';
import { buildClassificationUser, CLASSIFICATION_PROMPT_VERSION, CLASSIFICATION_SYSTEM } from './prompts';

const SAFE_ERRORS: Record<string, string> = {
  NOT_CONFIGURED: 'AI provider not configured',
  UNAVAILABLE: 'AI provider unavailable',
  REQUEST_ERROR: 'AI request failed',
  MALFORMED_OUTPUT: 'AI returned an unusable response',
};

// One structured call returns category + priority + intent + confidence. Runs asynchronously,
// after the ticket is already committed, so AI trouble can never block ticket creation.
export async function classifyTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      book: { select: { status: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { body: true } },
    },
  });
  if (!ticket) return;

  const fail = async (message: string) => {
    await prisma.ticket.update({ where: { id: ticketId }, data: { aiStatus: 'FAILED', aiError: message } });
    realtime.toAdmins('ticket:updated', { ticketId });
  };

  if (!aiService.isConfigured) return fail(SAFE_ERRORS.NOT_CONFIGURED!);

  await prisma.ticket.update({ where: { id: ticketId }, data: { aiStatus: 'PROCESSING', aiError: null } });
  logger.info({ event: 'ai.classification.start', ticketId }, 'classification started');

  try {
    const { value, provider, model } = await aiService.run({
      ticketId,
      operation: 'CLASSIFICATION',
      promptVersion: CLASSIFICATION_PROMPT_VERSION,
      system: CLASSIFICATION_SYSTEM,
      user: buildClassificationUser({
        subject: ticket.subject,
        description: ticket.messages[0]?.body ?? '',
        bookStatus: ticket.book?.status ?? null,
      }),
      maxOutputTokens: 150,
      temperature: 0,
      parse: parseClassification,
    });

    const priority = applyPriorityFloor(value.intent, value.priority);
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: {
          aiCategory: value.category,
          aiPriority: priority,
          aiConfidence: value.confidence,
          intent: value.intent,
          aiStatus: 'COMPLETED',
          aiError: null,
        },
      }),
      // Effective values are only set when the admin has not already overridden them.
      prisma.ticket.updateMany({ where: { id: ticketId, categoryOverridden: false }, data: { category: value.category } }),
      prisma.ticket.updateMany({ where: { id: ticketId, priorityOverridden: false }, data: { priority } }),
    ]);
    logger.info({ event: 'ai.classification.end', ticketId, provider, model, category: value.category, priority }, 'classification completed');
    realtime.toAdmins('ticket:updated', { ticketId });
  } catch (err) {
    const code = err instanceof AiError ? err.code : 'UNKNOWN';
    if (!(err instanceof AiError)) logger.error({ err, ticketId }, 'classification crashed');
    logger.warn({ event: 'ai.classification.failed', ticketId, code }, 'classification failed; admin must triage manually');
    await fail(SAFE_ERRORS[code] ?? 'AI processing failed');
  }
}
