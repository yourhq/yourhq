import posthog from "posthog-js";

const isEnabled =
  typeof window !== "undefined" &&
  !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  !window.location.hostname.includes("localhost");

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!isEnabled) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!isEnabled) return;
  posthog.identify(userId, properties);
}

export function setWorkspaceGroup(workspaceId: string, properties?: Record<string, unknown>) {
  if (!isEnabled) return;
  posthog.group("workspace", workspaceId, properties);
}

export function resetAnalytics() {
  if (!isEnabled) return;
  posthog.reset();
}
