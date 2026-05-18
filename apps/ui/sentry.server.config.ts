import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend } from "@/lib/sentry-filters";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isEnabled =
  process.env.DEPLOYMENT_MODE === "hosted" &&
  process.env.NODE_ENV === "production" &&
  !!dsn;

if (isEnabled) {
  Sentry.init({
    dsn,
    environment: "ui-server",
    tracesSampleRate: 0,
    beforeSend: sentryBeforeSend,
  });
}
