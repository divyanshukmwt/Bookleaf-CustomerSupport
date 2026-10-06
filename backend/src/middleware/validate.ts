import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { Errors } from '../lib/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function formatZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

// Validates and *replaces* the request parts with the parsed output, so handlers only ever
// see typed, trimmed, whitelisted data.
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(Errors.validation(formatZodIssues(err)));
      next(err);
    }
  };
}
