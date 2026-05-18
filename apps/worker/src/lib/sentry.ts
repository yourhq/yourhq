import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
const isEnabled = !!dsn && process.env.NODE_ENV !== "development";

let initialized = false;

export function initSentry(): void {
  if (!isEnabled || initialized) return;
  Sentry.init({
    dsn,
    environment: "worker",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  initialized = true;
}

export function captureWorkerException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isEnabled) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v);
      }
    }
    Sentry.captureException(err);
  });
}

export async function shutdownSentry(): Promise<void> {
  if (!isEnabled || !initialized) return;
  await Sentry.close(2000);
}
