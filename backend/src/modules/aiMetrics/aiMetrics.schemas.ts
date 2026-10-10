import { z } from 'zod';
import { RANGES } from '../ai/logic/aiMetrics';

// Every filter is a closed enum: nothing from the query string reaches the database unvalidated.
export const metricsQuery = z.object({
  range: z.enum(RANGES).default('24h'),
  provider: z.enum(['gemini', 'openai', 'anthropic']).optional(),
  operation: z.enum(['CLASSIFICATION', 'DRAFT', 'SUMMARY']).optional(),
  status: z.enum(['SUCCESS', 'FAILED']).optional(),
});

export const runsQuery = metricsQuery.extend({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type MetricsQuery = z.infer<typeof metricsQuery>;
export type RunsQuery = z.infer<typeof runsQuery>;
