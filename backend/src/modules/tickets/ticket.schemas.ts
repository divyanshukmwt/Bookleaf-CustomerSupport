import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1, 'Required').max(max);
const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).optional());

export const idParam = z.object({ id: z.string().uuid('Invalid id') });

export const createTicketBody = z
  .object({
    bookId: z.string().uuid().nullable().default(null), // null = General / Account Level
    subject: text(200),
    description: text(5000),
  })
  .strict(); // no `category`: authors never choose it, the AI classification sets it after the ticket is saved

export const messageBody = z.object({ body: text(5000) }).strict();
export const noteBody = z.object({ body: text(2000) }).strict();

export const adminListQuery = z.object({
  status: csv(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  category: csv(['ROYALTY_PAYMENTS', 'ISBN_METADATA', 'PRINTING_QUALITY', 'DISTRIBUTION_AVAILABILITY', 'PRODUCTION_UPDATES', 'GENERAL_INQUIRY']),
  priority: csv(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  assignee: z.union([z.literal('me'), z.literal('unassigned')]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['urgency', 'oldest', 'newest']).default('urgency'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminUpdateBody = z
  .object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    category: z.enum(['ROYALTY_PAYMENTS', 'ISBN_METADATA', 'PRINTING_QUALITY', 'DISTRIBUTION_AVAILABILITY', 'PRODUCTION_UPDATES', 'GENERAL_INQUIRY']).optional(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    assignedToId: z.union([z.literal('me'), z.string().uuid(), z.null()]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export type CreateTicketInput = z.infer<typeof createTicketBody>;
export type AdminListQuery = z.infer<typeof adminListQuery>;
export type AdminUpdateInput = z.infer<typeof adminUpdateBody>;
