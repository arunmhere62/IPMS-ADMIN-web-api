import { Logger } from '@nestjs/common';

const logger = new Logger('ProcessErrorHandler');

export function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (err: Error) => {
    logger.error(`UNCAUGHT EXCEPTION: ${err.message}`, err.stack);
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error(
      `UNHANDLED REJECTION: ${reason?.message || reason}`,
      reason?.stack || undefined,
    );
  });

  process.on('warning', (warning: Error) => {
    logger.warn(`Process warning: ${warning.name} - ${warning.message}`);
  });
}

export function registerGracefulShutdown(
  cleanup: () => Promise<void>,
  signals: string[] = ['SIGTERM', 'SIGINT'],
): void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) {
      logger.warn(`Received ${signal} again - forcing exit`);
      process.exit(1);
    }

    shuttingDown = true;
    logger.log(`Received ${signal} - starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s - forcing exit');
      process.exit(1);
    }, 10000);

    try {
      await cleanup();
      clearTimeout(forceExitTimer);
      logger.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err: any) {
      clearTimeout(forceExitTimer);
      logger.error(`Error during shutdown: ${err?.message}`, err?.stack);
      process.exit(1);
    }
  };

  for (const signal of signals) {
    process.on(signal as any, () => handler(signal));
  }
}
