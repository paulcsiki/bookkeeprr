import { pino, transport as pinoTransport, type Logger, type LoggerOptions } from 'pino';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export type AppLogger = Logger;

function getLogDir(): string {
  return join(process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config', 'logs');
}

function ensureLogDir(): void {
  try {
    mkdirSync(getLogDir(), { recursive: true });
  } catch {
    // ignore — pino-roll will surface filesystem errors later
  }
}

export function createLogger(opts: Partial<LoggerOptions> = {}): AppLogger {
  const level = opts.level ?? process.env.BOOKKEEPRR_LOG_LEVEL ?? 'info';

  // In test environments OR when explicitly disabled, skip the file transport.
  // Vitest tests run synchronously; spawning a pino-transport thread per worker would
  // slow tests + leak files.
  if (process.env.NODE_ENV === 'test' || process.env.BOOKKEEPRR_DISABLE_LOG_FILE === '1') {
    return pino({
      level,
      base: { app: 'bookkeeprr' },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...opts,
    });
  }

  ensureLogDir();

  const transport = pinoTransport({
    targets: [
      {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
        level,
      },
      {
        target: 'pino-roll',
        options: {
          file: join(getLogDir(), 'bookkeeprr'),
          extension: '.log',
          frequency: 'daily',
          mkdir: true,
          dateFormat: 'yyyy-MM-dd',
        },
        level,
      },
    ],
  });

  return pino(
    {
      level,
      base: { app: 'bookkeeprr' },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...opts,
    },
    transport,
  );
}

let rootLogger: AppLogger | null = null;
export function logger(): AppLogger {
  if (rootLogger) return rootLogger;
  rootLogger = createLogger();
  return rootLogger;
}
