import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { formatZodIssues } from './validate';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, requestId: String(req.id) },
  };
  res.status(404).json(body);
};

// Single place that maps errors to HTTP responses. Unexpected errors are logged in full but the
// client only ever receives a generic message plus a request id to quote to support.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);
  const send = (status: number, code: string, message: string, details?: unknown) => {
    const body: ErrorBody = { error: { code, message, requestId, ...(details !== undefined ? { details } : {}) } };
    res.status(status).json(body);
  };

  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, err.message);
    return send(err.status, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    return send(400, 'VALIDATION_ERROR', 'Request validation failed', formatZodIssues(err));
  }

  // body-parser errors (malformed JSON / oversized payload)
  const parserType = (err as { type?: string } | null)?.type;
  if (parserType === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (parserType === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(409, 'CONFLICT', 'A record with these values already exists');
    if (err.code === 'P2025') return send(404, 'NOT_FOUND', 'Resource not found');
  }

  req.log.error({ err }, 'unhandled error');
  return send(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
};
