import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './lib/prisma';
import { recoverStuckAiWork } from './jobs/aiQueue';
import { aiService } from './modules/ai/aiService';
import { initRealtime } from './realtime/socket';

// The HTTP server is created explicitly (not app.listen) so Socket.IO can attach to it.
const server = http.createServer(createApp());
initRealtime(server);

async function main() {
  await prisma.$connect();
  if (!aiService.isConfigured) logger.warn('No AI provider configured: tickets work, AI classification/drafts are disabled');
  await recoverStuckAiWork();
  server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening'));
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard stop if connections hang
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
