import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Secret } from "@/lib/secrets/types";

import { SecretRow } from "@/components/secrets/secret-row";

function makeSecret(overrides: Partial<Secret> = {}): Secret {
  return {
    id: "sec-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    gateway_id: "gw-1",
    agent_id: null,
    key: "NOTION_API_KEY",
    name: "Notion API Key",
    category: "user",
    note: null,
    sync_status: "active",
    last_synced_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("SecretRow", () => {
  afterEach(() => cleanup());

  it("renders secret name and key", () => {
    render(
      <SecretRow
        secret={makeSecret()}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Notion API Key")).toBeInTheDocument();
    expect(screen.getByText("NOTION_API_KEY")).toBeInTheDocument();
  });

  it("renders active sync status label", () => {
    render(
      <SecretRow
        secret={makeSecret({ sync_status: "active" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders pending sync status label", () => {
    render(
      <SecretRow
        secret={makeSecret({ sync_status: "pending" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Updating...")).toBeInTheDocument();
  });

  it("renders error sync status label", () => {
    render(
      <SecretRow
        secret={makeSecret({ sync_status: "error" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Sync error")).toBeInTheDocument();
  });

  it("renders waiting sync status label", () => {
    render(
      <SecretRow
        secret={makeSecret({ sync_status: "waiting" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Waiting for gateway")).toBeInTheDocument();
  });

  it("renders category label for user secrets", () => {
    render(
      <SecretRow
        secret={makeSecret({ category: "user" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders category label for channel secrets", () => {
    render(
      <SecretRow
        secret={makeSecret({ category: "channel" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Channel")).toBeInTheDocument();
  });

  it("renders category label for integration secrets", () => {
    render(
      <SecretRow
        secret={makeSecret({ category: "integration" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Integration")).toBeInTheDocument();
  });

  it("shows scopeLabel instead of category when provided", () => {
    render(
      <SecretRow
        secret={makeSecret({ category: "user" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        scopeLabel="Agent: Scout"
      />
    );
    expect(screen.getByText("Agent: Scout")).toBeInTheDocument();
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("renders note alongside category", () => {
    render(
      <SecretRow
        secret={makeSecret({ note: "For CRM sync" })}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText(/For CRM sync/)).toBeInTheDocument();
  });

  it("renders the actions dropdown trigger", () => {
    render(
      <SecretRow
        secret={makeSecret()}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Secret actions" })
    ).toBeInTheDocument();
  });

  it("does not render top border when isFirst is true", () => {
    const { container } = render(
      <SecretRow
        secret={makeSecret()}
        isFirst={true}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const row = container.firstChild as HTMLElement;
    expect(row.className).not.toContain("border-t");
  });

  it("renders top border when isFirst is false", () => {
    const { container } = render(
      <SecretRow
        secret={makeSecret()}
        isFirst={false}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const row = container.firstChild as HTMLElement;
    expect(row.className).toContain("border-t");
  });
});
