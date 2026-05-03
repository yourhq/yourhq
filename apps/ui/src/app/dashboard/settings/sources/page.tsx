import { SourcesPageClient } from "./client";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";
const notionOAuthConfigured = !!(
  process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET
);

export default function SourcesSettingsPage() {
  return (
    <SourcesPageClient
      isHosted={isHosted}
      notionOAuthConfigured={notionOAuthConfigured}
    />
  );
}
