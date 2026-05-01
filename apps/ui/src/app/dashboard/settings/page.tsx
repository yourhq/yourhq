import { SettingsIndex } from "./settings-index";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function SettingsPage() {
  return <SettingsIndex isHosted={isHosted} />;
}
