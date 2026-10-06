// One error type for every *expected* failure. The central error handler turns it into
// a consistent JSON body, so controllers/services just throw and never build error responses.
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details),
  validation: (details: unknown) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  // For author-owned resources we answer 404 (not 403) when the record exists but belongs to
  // someone else, so ids cannot be probed for existence.
  notFound: (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  tooManyRequests: (message: string) => new AppError(429, 'RATE_LIMITED', message),
};
