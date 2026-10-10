-- AlterTable: the exact context (facts + knowledge-base references) supplied for each draft,
-- so admins can verify a draft against what the AI was actually given.
ALTER TABLE "ai_drafts" ADD COLUMN "contextSnapshot" JSONB;

-- AlterTable: per-attempt detail so the admin AI dashboard can report retries and failure reasons.
ALTER TABLE "ai_runs" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "retryable" BOOLEAN;

-- CreateIndex
CREATE INDEX "ai_runs_provider_createdAt_idx" ON "ai_runs"("provider", "createdAt");

-- AlterTable: when the recipient (the other party) viewed a message. NULL = unread.
ALTER TABLE "ticket_messages" ADD COLUMN "readAt" TIMESTAMP(3);

-- Messages that existed before read tracking are treated as already read, so nobody
-- opens the portal to a flood of stale unread badges.
UPDATE "ticket_messages" SET "readAt" = "createdAt" WHERE "readAt" IS NULL;

-- CreateIndex: unread counts are looked up per ticket and sender side.
CREATE INDEX "ticket_messages_ticketId_senderRole_readAt_idx" ON "ticket_messages"("ticketId", "senderRole", "readAt");
