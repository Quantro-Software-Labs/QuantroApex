import * as Sentry from '@sentry/node';
import { config } from '../../config/index.js';

let initialized = false;

export function initSentry(): void {
  const dsn = config.sentry.dsn;
  if (!dsn) {
    return;
  }
  if (initialized) return;

  Sentry.init({
    dsn,
    environment: config.nodeEnv,
    tracesSampleRate: config.isDev ? 1.0 : 0.1,
  });
  initialized = true;
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!config.sentry.dsn) {
    process.stdout.write(
      JSON.stringify({
        event: 'sentry_noop_exception',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }) + '\n',
    );
    return;
  }

  if (!initialized) {
    initSentry();
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export { Sentry };
