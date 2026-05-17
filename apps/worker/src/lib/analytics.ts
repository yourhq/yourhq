import { PostHog } from "posthog-node";

const token = process.env.POSTHOG_API_KEY;
const isEnabled = !!token;

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!isEnabled) return null;
  if (!client) {
    client = new PostHog(token!, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 10,
      flushInterval: 5000,
    });
  }
  return client;
}

export function trackWorkerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  groups?: { workspace?: string },
) {
  getClient()?.capture({
    distinctId,
    event,
    properties,
    groups: groups?.workspace ? { workspace: groups.workspace } : undefined,
  });
}

export async function shutdownAnalytics() {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
