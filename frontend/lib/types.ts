export type Role = 'AUTHOR' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Category = 'ROYALTY_PAYMENTS' | 'ISBN_METADATA' | 'PRINTING_QUALITY' | 'DISTRIBUTION_AVAILABILITY' | 'PRODUCTION_UPDATES' | 'GENERAL_INQUIRY';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AiStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface User { id: string; email: string; name: string; role: Role; authorId: string | null }

export interface Book {
  id: string; title: string; isbn: string; genre: string; publicationDate: string | null; status: string;
  mrp: number | null; totalCopiesSold: number; totalRoyaltyEarned: number; royaltyPaid: number;
  royaltyPending: number; lastRoyaltyPayoutDate: string | null; availableOn: string[];
}

export interface Message { id: string; ticketId: string; senderRole: Role; body: string; createdAt: string; readAt: string | null; sender?: { name: string } } // `sender` is only sent to admins

export interface AuthorTicketSummary {
  id: string; ticketNumber: number; subject: string; status: TicketStatus; createdAt: string; lastMessageAt: string;
  book: { id: string; title: string } | null; _count: { messages: number }; unreadCount: number;
}
export interface AuthorTicket extends Omit<AuthorTicketSummary, '_count' | 'unreadCount'> { messages: Message[] }

export interface AdminTicketSummary {
  id: string; ticketNumber: number; subject: string; status: TicketStatus; category: Category | null; priority: Priority | null;
  categoryOverridden: boolean; priorityOverridden: boolean; aiStatus: AiStatus; aiConfidence: number | null;
  createdAt: string; lastMessageAt: string; unreadCount: number;
  assignedTo: { id: string; name: string } | null;
  author: { authorCode: string; user: { name: string } };
  book: { id: string; title: string } | null;
}

export interface InternalNote { id: string; body: string; createdAt: string; createdBy: { id: string; name: string } }

export interface AdminTicket extends Omit<AdminTicketSummary, 'author' | 'book'> {
  aiCategory: Category | null; aiPriority: Priority | null; intent: string | null; aiError: string | null;
  author: { authorCode: string; city: string | null; user: { name: string; email: string } };
  book: { id: string; title: string; isbn: string; status: string; totalCopiesSold: number; royaltyPending: number } | null;
  messages: Message[]; internalNotes: InternalNote[];
  conversationState: { currentTopic: Category | null; summary: string | null; version: number } | null;
}

export interface KbReference {
  docId: string; slug: string; title: string; version: number; heading: string; reason: string; totalEntries: number;
  fullDocumentSupplied: true; excerpts: { entry: number; text: string; matched: boolean }[];
}
export interface ContextSnapshot {
  schemaVersion: 1; scope: string; intent: string; category: Category | null; route: Draft['route'];
  books: { bookCode: string | null; title: string; status: string }[];
  facts: { authorFirstName: string; books: { title: string; fields: { key: string; label: string; value: string }[]; notes: string[] }[]; payout: { quarterEnd: string; deadline: string; deadlinePassed: boolean } | null } | null;
  kb: { status: 'SUPPLIED' | 'NOT_REQUIRED' | 'NONE_FOUND'; version: string; note: string | null; references: KbReference[] };
}
export interface DraftResponse { draft: Draft | null; context: ContextSnapshot }

export interface ValidationIssue { severity: 'error' | 'warning'; code: string; message: string }
export interface Draft {
  id: string; status: AiStatus; source: 'AI' | 'TEMPLATE'; route: 'DB_ONLY' | 'KB_ONLY' | 'HYBRID' | 'INSUFFICIENT_INFORMATION';
  body: string | null; validationStatus: 'PASSED' | 'FLAGGED' | 'REJECTED' | null; validationIssues: ValidationIssue[] | null;
  context: ContextSnapshot | null;
  error: string | null; createdAt: string;
}

// ---- admin AI metrics
export interface MetricsBucket { runs: number; success: number; failed: number; avgLatencyMs: number | null; successRate: number | null }
export interface AiMetrics {
  range: string; since: string | null; generatedAt: string;
  filters: { provider: string | null; operation: string | null; status: string | null };
  configured: { provider: string; model: string; role: 'primary' | 'fallback' }[];
  totals: MetricsBucket & { failureRate: number | null; retries: number; fallbackRuns: number; inputTokens: number; outputTokens: number };
  byProvider: (MetricsBucket & { provider: string; fallbackRuns: number; retries: number })[];
  byOperation: (MetricsBucket & { operation: string })[];
  failureReasons: { code: string; label: string; count: number; retryable: boolean | null; providers: string[] }[];
  classification: { completed: number; failed: number; processing: number; pending: number };
  drafts: { total: number; completed: number; failed: number; processing: number; bySource: { ai: number; template: number }; byValidation: { passed: number; flagged: number; rejected: number } };
  cache: { recorded: boolean; note: string };
}
export interface AiRunRow {
  id: string; createdAt: string; provider: string; model: string; operation: string; status: 'SUCCESS' | 'FAILED'; latencyMs: number;
  attempt: number; isFallback: boolean; retryable: boolean | null; errorCode: string | null; errorLabel: string | null; error: string | null;
  promptVersion: string; inputTokens: number | null; outputTokens: number | null; ticketId: string; ticketNumber: number;
}
export interface AiRunsPage { page: number; pageSize: number; total: number; items: AiRunRow[] }
