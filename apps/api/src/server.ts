import { createApp } from './app';
import { getEnv } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './common/logger';

const env = getEnv();
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`SprintFlow API running on port ${env.PORT} [${env.NODE_ENV}]`);
});

// Graceful Shutdown
let isShuttingDown = false;

async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Force shutdown timeout after 10 seconds
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcefully terminating process.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        logger.info('HTTP server closed successfully.');
        resolve();
      });
    });

    await prisma.$disconnect();
    logger.info('Database connection closed.');

    logger.info('Graceful shutdown complete.');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown:');
    process.exit(1);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
