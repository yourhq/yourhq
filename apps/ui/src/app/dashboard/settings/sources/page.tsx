import { SourcesPageClient } from "./client";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function SourcesSettingsPage() {
  return <SourcesPageClient isHosted={isHosted} />;
}
