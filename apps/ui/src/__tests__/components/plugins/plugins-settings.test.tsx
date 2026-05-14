import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { HQPlugin } from "@/lib/plugins/types";

vi.mock("@/hooks/use-plugins", () => ({
  usePlugins: (initial: HQPlugin[]) => ({
    plugins: initial,
    toggleEnabled: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    refetch: vi.fn(),
  }),
}));

vi.mock("./add-webhook-plugin-dialog", () => ({
  AddWebhookPluginDialog: () => null,
}));

vi.mock("./plugin-detail-dialog", () => ({
  PluginDetailDialog: () => null,
}));

import { PluginsSettings } from "@/components/plugins/plugins-settings";

function makePlugin(overrides: Partial<HQPlugin> = {}): HQPlugin {
  return {
    id: "p-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    plugin_id: "usage-alerts",
    name: "Usage Alerts",
    description: "Budget monitoring",
    version: "1.0.0",
    source: "builtin",
    is_enabled: true,
    hooks: ["usage.recorded"],
    entry_module: null,
    webhook_url: null,
    webhook_secret: null,
    config: {},
    config_schema: null,
    capabilities: [],
    installed_by: null,
    meta: {},
    ...overrides,
  };
}

describe("PluginsSettings", () => {
  afterEach(() => cleanup());

  it("renders page header", () => {
    render(<PluginsSettings initialPlugins={[]} />);
    expect(screen.getByText("Plugins")).toBeInTheDocument();
    expect(
      screen.getByText(/Extend HQ with webhook integrations/)
    ).toBeInTheDocument();
  });

  it("shows empty state when no plugins", () => {
    render(<PluginsSettings initialPlugins={[]} />);
    expect(screen.getByText("No plugins yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Plugins let you react to HQ events/)
    ).toBeInTheDocument();
  });

  it("renders builtin section header", () => {
    render(
      <PluginsSettings initialPlugins={[makePlugin({ source: "builtin" })]} />
    );
    const builtins = screen.getAllByText("Built-in");
    expect(builtins.length).toBeGreaterThanOrEqual(1);
  });

  it("renders installed section header when both builtin and installed exist", () => {
    const plugins = [
      makePlugin({ id: "p-1", source: "builtin" }),
      makePlugin({
        id: "p-2",
        plugin_id: "slack-hook",
        name: "Slack Hook",
        source: "webhook",
      }),
    ];
    render(<PluginsSettings initialPlugins={plugins} />);
    const builtins = screen.getAllByText("Built-in");
    expect(builtins.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("renders plugin names", () => {
    const plugins = [
      makePlugin({ id: "p-1", name: "Usage Alerts" }),
      makePlugin({
        id: "p-2",
        plugin_id: "slack-hook",
        name: "Slack Notifier",
        source: "webhook",
      }),
    ];
    render(<PluginsSettings initialPlugins={plugins} />);
    expect(screen.getByText("Usage Alerts")).toBeInTheDocument();
    expect(screen.getByText("Slack Notifier")).toBeInTheDocument();
  });

  it("renders Add plugin button", () => {
    render(<PluginsSettings initialPlugins={[]} />);
    expect(
      screen.getByRole("button", { name: /Add plugin/i })
    ).toBeInTheDocument();
  });
});
