import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const IGNORED_MESSAGES = [
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
  "Non-Error promise rejection captured",
  "NEXT_NOT_FOUND",
  "NEXT_REDIRECT",
];

const TRANSIENT_PATTERNS = [
  /websocket.*reconnect/i,
  /connection.*closed/i,
  /realtime.*disconn/i,
  /JWT expired/i,
  /fetch failed/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /AbortError/i,
];

export function sentryBeforeSend(
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent | null {
  const error = hint.originalException;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (IGNORED_MESSAGES.some((m) => message.includes(m))) return null;
  if (TRANSIENT_PATTERNS.some((p) => p.test(message))) return null;

  // Drop errors from browser extensions
  const frames =
    event.exception?.values?.[0]?.stacktrace?.frames ?? [];
  if (
    frames.some(
      (f) =>
        f.filename?.startsWith("chrome-extension://") ||
        f.filename?.startsWith("moz-extension://"),
    )
  )
    return null;

  return event;
}
