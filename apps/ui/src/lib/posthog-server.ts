import { PostHog } from "posthog-node";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const isEnabled =
  process.env.DEPLOYMENT_MODE === "hosted" && !!token;

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  if (!isEnabled) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(token!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  groups?: { workspace?: string },
) {
  getPostHogClient()?.capture({
    distinctId,
    event,
    properties,
    groups: groups?.workspace ? { workspace: groups.workspace } : undefined,
  });
}
