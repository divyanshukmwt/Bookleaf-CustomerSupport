import pino from 'pino';
import { env } from './env';

// Structured JSON logs. Credentials are redacted defensively even though we never log them on purpose.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'bookleaf-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
});
