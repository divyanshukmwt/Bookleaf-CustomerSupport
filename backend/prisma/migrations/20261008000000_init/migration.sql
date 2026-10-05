-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AUTHOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ROYALTY_PAYMENTS', 'ISBN_METADATA', 'PRINTING_QUALITY', 'DISTRIBUTION_AVAILABILITY', 'PRODUCTION_UPDATES', 'GENERAL_INQUIRY');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TicketIntent" AS ENUM ('SALES_FIGURES', 'ROYALTY_STATUS', 'ROYALTY_CALCULATION', 'PRODUCTION_STATUS', 'AVAILABILITY_ISSUE', 'ISBN_ISSUE', 'PRINT_QUALITY_ISSUE', 'POLICY_QUESTION', 'METADATA_UPDATE', 'OTHER');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('AI', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "ContextRoute" AS ENUM ('DB_ONLY', 'KB_ONLY', 'HYBRID', 'INSUFFICIENT_INFORMATION');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PASSED', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiOperation" AS ENUM ('CLASSIFICATION', 'DRAFT', 'SUMMARY');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "authorCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "joinedDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "publicationDate" DATE,
    "status" TEXT NOT NULL,
    "mrp" INTEGER,
    "authorRoyaltyPerCopy" INTEGER,
    "totalCopiesSold" INTEGER NOT NULL DEFAULT 0,
    "totalRoyaltyEarned" INTEGER NOT NULL DEFAULT 0,
    "royaltyPaid" INTEGER NOT NULL DEFAULT 0,
    "royaltyPending" INTEGER NOT NULL DEFAULT 0,
    "lastRoyaltyPayoutDate" DATE,
    "printPartner" TEXT,
    "availableOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" SERIAL NOT NULL,
    "authorId" TEXT NOT NULL,
    "bookId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "category" "TicketCategory",
    "priority" "TicketPriority",
    "categoryOverridden" BOOLEAN NOT NULL DEFAULT false,
    "priorityOverridden" BOOLEAN NOT NULL DEFAULT false,
    "aiCategory" "TicketCategory",
    "aiPriority" "TicketPriority",
    "aiConfidence" DOUBLE PRECISION,
    "intent" "TicketIntent",
    "aiStatus" "AiStatus" NOT NULL DEFAULT 'PENDING',
    "aiError" TEXT,
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_internal_notes" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_state" (
    "ticketId" TEXT NOT NULL,
    "currentTopic" "TicketCategory",
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastMessageId" TEXT,
    "summarizedThroughMessageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_state_pkey" PRIMARY KEY ("ticketId")
);

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "AiStatus" NOT NULL,
    "source" "DraftSource" NOT NULL,
    "route" "ContextRoute" NOT NULL,
    "body" TEXT,
    "lastMessageId" TEXT NOT NULL,
    "conversationVersion" INTEGER NOT NULL,
    "dbContextHash" TEXT NOT NULL,
    "kbVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "validationStatus" "ValidationStatus",
    "validationIssues" JSONB,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "operation" "AiOperation" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "status" "AiRunStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "authors_authorCode_key" ON "authors"("authorCode");

-- CreateIndex
CREATE UNIQUE INDEX "authors_userId_key" ON "authors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "books_bookCode_key" ON "books"("bookCode");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_authorId_idx" ON "books"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_category_idx" ON "tickets"("category");

-- CreateIndex
CREATE INDEX "tickets_priority_idx" ON "tickets"("priority");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE INDEX "tickets_authorId_idx" ON "tickets"("authorId");

-- CreateIndex
CREATE INDEX "tickets_assignedToId_idx" ON "tickets"("assignedToId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_internal_notes_ticketId_idx" ON "ticket_internal_notes"("ticketId");

-- CreateIndex
CREATE INDEX "ai_drafts_ticketId_createdAt_idx" ON "ai_drafts"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_runs_ticketId_idx" ON "ai_runs"("ticketId");

-- CreateIndex
CREATE INDEX "ai_runs_createdAt_idx" ON "ai_runs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_slug_key" ON "knowledge_documents"("slug");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_internal_notes" ADD CONSTRAINT "ticket_internal_notes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_internal_notes" ADD CONSTRAINT "ticket_internal_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_state" ADD CONSTRAINT "conversation_state_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
