import { z } from 'zod';
import {
  TicketStatus,
  TicketCategory,
  TicketPriority,
} from '@prisma/client';

const text = (max: number) =>
  z.string().trim().min(1, 'Required').max(max);

const csv = <T extends [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    )
    .pipe(z.array(z.enum(values)).optional());

export const idParam = z.object({
  id: z.string().uuid('Invalid id'),
});

export const createTicketBody = z
  .object({
    bookId: z.string().uuid().nullable().default(null),
    subject: text(200),
    description: text(5000),
  })
  .strict();

export const messageBody = z.object({ body: text(5000) }).strict();
export const noteBody = z.object({ body: text(2000) }).strict();

export const adminListQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    )
    .pipe(z.array(z.nativeEnum(TicketStatus)).optional()),

  category: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    )
    .pipe(z.array(z.nativeEnum(TicketCategory)).optional()),

  priority: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    )
    .pipe(z.array(z.nativeEnum(TicketPriority)).optional()),

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
    status: z.nativeEnum(TicketStatus).optional(),
    category: z.nativeEnum(TicketCategory).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    assignedToId: z.union([z.literal('me'), z.string().uuid(), z.null()]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });

export type CreateTicketInput = z.infer<typeof createTicketBody>;
export type AdminListQuery = z.infer<typeof adminListQuery>;
export type AdminUpdateInput = z.infer<typeof adminUpdateBody>;