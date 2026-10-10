import type { AiDraft, Prisma } from '@prisma/client';
import { logger } from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { AiError, aiService } from './aiService';
import { buildContext, type DraftContext } from './context.service';
import { ensureSummary } from './conversation.service';
import type { ContextSnapshot } from './logic/contextSnapshot';
import { parseDraftReply } from './logic/output';
import { outOfScopeTemplate, salesTemplate } from './logic/templates';
import { CATEGORY_LABELS } from './logic/types';
import { validateDraft } from './logic/validateDraft';
import { buildDraftUser, DRAFT_PROMPT_VERSION, DRAFT_SYSTEM } from './prompts';
import { RESPONSE_GUIDANCE } from '../knowledge/kb.content';

// A PROCESSING draft older than this is assumed dead (crashed worker) and may be replaced.
const STALE_PROCESSING_MS = 2 * 60 * 1000;

export interface DraftDto {
  id: string;
  status: AiDraft['status'];
  source: AiDraft['source'];
  route: AiDraft['route'];
  body: string | null;
  validationStatus: AiDraft['validationStatus'];
  validationIssues: unknown;
  context: unknown; // ContextSnapshot, or null for drafts created before snapshots were recorded
  error: string | null;
  createdAt: Date;
}

function toDto(d: AiDraft): DraftDto {
  return {
    id: d.id,
    status: d.status,
    source: d.source,
    route: d.route,
    // A draft that failed validation (e.g. contradicts the database) is never shown to the admin.
    body: d.validationStatus === 'REJECTED' ? null : d.body,
    validationStatus: d.validationStatus,
    validationIssues: d.validationIssues,
    context: d.contextSnapshot,
    error: d.error,
    createdAt: d.createdAt,
  };
}

function baseData(ctx: DraftContext, requestedById: string | null) {
  return {
    ticketId: ctx.ticketId,
    route: ctx.route,
    lastMessageId: ctx.lastMessageId,
    conversationVersion: ctx.conversationVersion,
    dbContextHash: ctx.dbContextHash,
    kbVersion: ctx.kbVersion,
    promptVersion: DRAFT_PROMPT_VERSION,
    contextSnapshot: ctx.snapshot as unknown as Prisma.InputJsonValue,
    requestedById,
  };
}

// Opening a ticket calls this with force=false: a draft with an identical cache key is reused and
// the LLM is NOT called again. Regenerate calls it with force=true.
export async function getOrCreateDraft(ticketId: string, adminId: string, force: boolean): Promise<{ draft: DraftDto | null; context: ContextSnapshot }> {
  const ctx = await buildContext(ticketId);
  // `context` is the live view of what a draft would be built from right now; `draft.context` is what
  // the stored draft was actually built from. Both come from the one buildContext call above.
  return { draft: await resolveDraft(ctx, ticketId, adminId, force), context: ctx.snapshot };
}

async function resolveDraft(ctx: DraftContext, ticketId: string, adminId: string, force: boolean): Promise<DraftDto | null> {
  if (!force) {
    const cached = await prisma.aiDraft.findFirst({
      where: {
        ticketId,
        lastMessageId: ctx.lastMessageId,
        conversationVersion: ctx.conversationVersion,
        dbContextHash: ctx.dbContextHash,
        kbVersion: ctx.kbVersion,
        promptVersion: DRAFT_PROMPT_VERSION,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (cached) {
      if (cached.status === 'PROCESSING' && Date.now() - cached.updatedAt.getTime() > STALE_PROCESSING_MS) {
        const failed = await prisma.aiDraft.update({ where: { id: cached.id }, data: { status: 'FAILED', error: 'Draft generation timed out. Click Regenerate to try again.' } });
        return toDto(failed);
      }
      return toDto(cached);
    }
  }

  // Cost guard: if the admin already replied and the author hasn't written back, there is nothing
  // new to answer, so opening the ticket must not trigger generation. Regenerate still works.
  if (!force && ctx.lastSenderRole === 'ADMIN') return null;

  if (ctx.scope === 'OUT_OF_SCOPE') {
    // Unrelated to BookLeaf support: polite redirect, no LLM, no author data (see context.service).
    const body = outOfScopeTemplate(ctx.firstName);
    const validation = validateDraft({ reply: body, allowed: ctx.allowed, authorText: '', requiresTimeline: false });
    const draft = await prisma.aiDraft.create({
      data: {
        ...baseData(ctx, adminId),
        status: 'COMPLETED',
        source: 'TEMPLATE',
        body,
        validationStatus: validation.status,
        validationIssues: validation.issues as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(draft);
  }

  if (ctx.route === 'INSUFFICIENT_INFORMATION') {
    const draft = await prisma.aiDraft.create({
      data: { ...baseData(ctx, adminId), status: 'COMPLETED', source: 'TEMPLATE', body: null, error: ctx.scope === 'UNCLEAR' ? 'The latest message is too short or unclear to draft a reply automatically. Please review it and reply manually.' : 'Not enough verified information for an automated draft. Please investigate and reply manually.' },
    });
    return toDto(draft);
  }

  if (ctx.route === 'DB_ONLY') {
    // Deterministic answer straight from PostgreSQL: zero LLM cost.
    const body = salesTemplate(ctx.firstName, ctx.books);
    const validation = validateDraft({ reply: body, allowed: ctx.allowed, authorText: ctx.authorText, requiresTimeline: false });
    const draft = await prisma.aiDraft.create({
      data: {
        ...baseData(ctx, adminId),
        status: 'COMPLETED',
        source: 'TEMPLATE',
        body,
        validationStatus: validation.status,
        validationIssues: validation.issues as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(draft);
  }

  // LLM route. Claim the generation under a per-ticket advisory lock so two admins opening the
  // same ticket (or double clicks) never trigger duplicate LLM calls.
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ticketId}))`;
    const inFlight = await tx.aiDraft.findFirst({
      where: { ticketId, status: 'PROCESSING', updatedAt: { gt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    });
    if (inFlight) return { draft: inFlight, created: false };
    const draft = await tx.aiDraft.create({ data: { ...baseData(ctx, adminId), status: 'PROCESSING', source: 'AI' } });
    return { draft, created: true };
  });

  if (claim.created) {
    logger.info({ event: 'ai.draft.start', ticketId, route: ctx.route, intent: ctx.intent, forced: force }, 'draft generation started');
    void runGeneration(claim.draft.id, ctx);
  }
  return toDto(claim.draft);
}

async function runGeneration(draftId: string, ctx: DraftContext): Promise<void> {
  const fail = (error: string) => prisma.aiDraft.update({ where: { id: draftId }, data: { status: 'FAILED', error } });
  try {
    if (!aiService.isConfigured) {
      await fail('AI provider is not configured. Please write the reply manually.');
      return;
    }

    let summary = ctx.summary;
    let version = ctx.conversationVersion;
    if (ctx.needsSummary) {
      const s = await ensureSummary(ctx.ticketId);
      summary = s.summary;
      version = s.version;
    }

    const { value: reply, provider, model } = await aiService.run({
      ticketId: ctx.ticketId,
      operation: 'DRAFT',
      promptVersion: DRAFT_PROMPT_VERSION,
      system: DRAFT_SYSTEM,
      user: buildDraftUser({
        firstName: ctx.firstName,
        subject: ctx.subject,
        categoryLabel: ctx.category ? CATEGORY_LABELS[ctx.category] : 'General Inquiry',
        factsText: ctx.factsText,
        kbText: ctx.kbText,
        guidance: RESPONSE_GUIDANCE[ctx.category ?? 'GENERAL_INQUIRY'],
        summary,
        recent: ctx.recent,
        current: ctx.current,
      }),
      maxOutputTokens: 700,
      temperature: 0.2,
      parse: parseDraftReply,
    });

    const validation = validateDraft({ reply, allowed: ctx.allowed, authorText: ctx.authorText, requiresTimeline: ctx.requiresTimeline });
    await prisma.aiDraft.update({
      where: { id: draftId },
      data: {
        status: 'COMPLETED',
        body: reply,
        conversationVersion: version,
        validationStatus: validation.status,
        validationIssues: validation.issues as unknown as Prisma.InputJsonValue,
        error: validation.status === 'REJECTED' ? 'The AI draft contradicted verified data and was withheld. Regenerate or reply manually.' : null,
      },
    });
    logger.info({ event: 'ai.draft.end', ticketId: ctx.ticketId, provider, model, validation: validation.status }, 'draft generation completed');
  } catch (err) {
    const message =
      err instanceof AiError
        ? err.code === 'UNAVAILABLE'
          ? 'The AI service is currently unavailable. You can reply manually or try Regenerate later.'
          : err.code === 'MALFORMED_OUTPUT'
            ? 'The AI returned an unusable response. Try Regenerate or reply manually.'
            : 'The AI request failed. Please reply manually.'
        : 'Draft generation failed unexpectedly. Please reply manually.';
    if (!(err instanceof AiError)) logger.error({ err, ticketId: ctx.ticketId }, 'draft generation crashed');
    await fail(message).catch((e) => logger.error({ e }, 'could not record draft failure'));
  }
}
