import { SettingsShell } from "./settings-shell";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsShell isHosted={isHosted}>{children}</SettingsShell>;
}
