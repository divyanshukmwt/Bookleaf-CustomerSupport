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

export interface Message { id: string; ticketId: string; senderRole: Role; body: string; createdAt: string }

export interface AuthorTicketSummary {
  id: string; ticketNumber: number; subject: string; status: TicketStatus; createdAt: string; lastMessageAt: string;
  book: { id: string; title: string } | null; _count: { messages: number };
}
export interface AuthorTicket extends Omit<AuthorTicketSummary, '_count'> { messages: Message[] }

export interface AdminTicketSummary {
  id: string; ticketNumber: number; subject: string; status: TicketStatus; category: Category | null; priority: Priority | null;
  categoryOverridden: boolean; priorityOverridden: boolean; aiStatus: AiStatus; aiConfidence: number | null;
  createdAt: string; lastMessageAt: string;
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

export interface ValidationIssue { severity: 'error' | 'warning'; code: string; message: string }
export interface Draft {
  id: string; status: AiStatus; source: 'AI' | 'TEMPLATE'; route: 'DB_ONLY' | 'KB_ONLY' | 'HYBRID' | 'INSUFFICIENT_INFORMATION';
  body: string | null; validationStatus: 'PASSED' | 'FLAGGED' | 'REJECTED' | null; validationIssues: ValidationIssue[] | null;
  error: string | null; createdAt: string;
}
