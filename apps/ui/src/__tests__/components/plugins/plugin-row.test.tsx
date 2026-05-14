import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HQPlugin } from "@/lib/plugins/types";

import { PluginRow } from "@/components/plugins/plugin-row";

function makePlugin(overrides: Partial<HQPlugin> = {}): HQPlugin {
  return {
    id: "p-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    plugin_id: "usage-alerts",
    name: "Usage Alerts",
    description: "Logs warnings when agents approach budget limits",
    version: "1.0.0",
    source: "builtin",
    is_enabled: true,
    hooks: ["usage.recorded", "budget.exceeded"],
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

describe("PluginRow", () => {
  afterEach(() => cleanup());

  it("renders plugin name", () => {
    render(
      <PluginRow
        plugin={makePlugin()}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Usage Alerts")).toBeInTheDocument();
  });

  it("renders plugin description", () => {
    render(
      <PluginRow
        plugin={makePlugin()}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByText("Logs warnings when agents approach budget limits")
    ).toBeInTheDocument();
  });

  it("renders version", () => {
    render(
      <PluginRow
        plugin={makePlugin({ version: "2.1.0" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("v2.1.0")).toBeInTheDocument();
  });

  it("renders Built-in source badge", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "builtin" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Built-in")).toBeInTheDocument();
  });

  it("renders Webhook source badge", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "webhook" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Webhook")).toBeInTheDocument();
  });

  it("renders Local source badge", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "local" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Local")).toBeInTheDocument();
  });

  it("renders Marketplace source badge", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "marketplace" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Marketplace")).toBeInTheDocument();
  });

  it("shows hook count when no description", () => {
    render(
      <PluginRow
        plugin={makePlugin({
          description: null,
          hooks: ["task.created", "task.completed"],
        })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("shows singular event count", () => {
    render(
      <PluginRow
        plugin={makePlugin({
          description: null,
          hooks: ["task.created"],
        })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("renders enabled toggle switch", () => {
    render(
      <PluginRow
        plugin={makePlugin({ is_enabled: true })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("switch", { name: "Disable plugin" })
    ).toBeInTheDocument();
  });

  it("renders disabled toggle switch", () => {
    render(
      <PluginRow
        plugin={makePlugin({ is_enabled: false })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("switch", { name: "Enable plugin" })
    ).toBeInTheDocument();
  });

  it("calls onSelect when row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PluginRow
        plugin={makePlugin()}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={onSelect}
      />
    );
    await user.click(screen.getByText("Usage Alerts"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not show actions menu for builtin plugins", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "builtin" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Plugin actions" })
    ).not.toBeInTheDocument();
  });

  it("shows actions menu for non-builtin plugins", () => {
    render(
      <PluginRow
        plugin={makePlugin({ source: "webhook" })}
        isFirst={true}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Plugin actions" })
    ).toBeInTheDocument();
  });
});
