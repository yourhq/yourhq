import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { sentryBeforeSend } from "@/lib/sentry-filters";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");
if (sentryDsn && !isLocalhost) {
  Sentry.init({
    dsn: sentryDsn,
    environment: "ui-client",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: sentryBeforeSend,
  });
}

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: true,
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    debug: process.env.NODE_ENV === "development",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
