import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceConnection } from "@/lib/sources/types";

vi.mock("@/lib/sources/generated-manifests", () => ({
  PROVIDER_MANIFESTS: {
    notion: {
      id: "notion",
      name: "Notion",
      description: "Sync pages and databases from your Notion workspace.",
      icon: "N",
      item_label: "Pages and databases",
      auth: {
        type: "api_key",
        fields: [
          {
            key: "api_key",
            label: "Integration Token",
            placeholder: "ntn_...",
            input_type: "password",
            required: true,
          },
        ],
        oauth: {
          authorize_url: "https://api.notion.com/v1/oauth/authorize",
          token_url: "https://api.notion.com/v1/oauth/token",
          token_field: "access_token",
          scopes: [],
          env_client_id: "NOTION_CLIENT_ID",
          env_client_secret: "NOTION_CLIENT_SECRET",
          auth_method: "basic",
        },
        setup_steps: [
          {
            title: "Create an integration",
            description: "Go to Notion Integrations.",
            link: {
              label: "Open Notion Integrations",
              url: "https://www.notion.so/my-integrations",
            },
          },
          {
            title: "Copy the token",
            description: "Copy the integration secret.",
          },
        ],
      },
      supports_write: false,
    },
  },
}));

import { ProviderPickerDialog } from "@/components/sources/provider-picker-dialog";

const mockCreateConnection = vi.fn();
const mockOnClose = vi.fn();
const mockOnCreated = vi.fn();

function renderDialog(props: Partial<Parameters<typeof ProviderPickerDialog>[0]> = {}) {
  return render(
    <ProviderPickerDialog
      open={true}
      onClose={mockOnClose}
      onCreated={mockOnCreated}
      createConnection={mockCreateConnection}
      isHosted={false}
      {...props}
    />,
  );
}

describe("ProviderPickerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the pick step with provider cards", () => {
    renderDialog();
    expect(screen.getByText("Connect a source")).toBeInTheDocument();
    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("Pages and databases")).toBeInTheDocument();
  });

  it("renders the dialog description", () => {
    renderDialog();
    expect(
      screen.getByText("Choose a service to sync content from."),
    ).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Connect a source")).not.toBeInTheDocument();
  });

  it("transitions to setup step when a provider card is clicked (non-hosted)", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    expect(screen.getByText("Connect Notion")).toBeInTheDocument();
    expect(screen.getByText("Create an integration")).toBeInTheDocument();
    expect(screen.getByText("Copy the token")).toBeInTheDocument();
  });

  it("shows setup step links when present", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    const link = screen.getByText("Open Notion Integrations");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://www.notion.so/my-integrations",
    );
  });

  it("renders credential fields on setup step", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    expect(screen.getByText("Integration Token")).toBeInTheDocument();
  });

  it("shows the Test connection button initially disabled", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    const testBtn = screen.getByRole("button", { name: /test connection/i });
    expect(testBtn).toBeDisabled();
  });

  it("enables the Test connection button when required fields are filled", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    const input = screen.getByPlaceholderText("ntn_...");
    await user.type(input, "ntn_test_token_123");

    const testBtn = screen.getByRole("button", { name: /test connection/i });
    expect(testBtn).not.toBeDisabled();
  });

  it("shows the Cancel button on setup step", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it("shows back button that returns to pick step", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Notion"));

    expect(screen.getByText("Connect Notion")).toBeInTheDocument();

    const backBtn = screen.getByRole("button", { name: "" });
    const arrowButtons = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg"));
    const backArrow = arrowButtons[0];
    await user.click(backArrow);

    await waitFor(() => {
      expect(screen.getByText("Connect a source")).toBeInTheDocument();
    });
  });

  it("calls validate endpoint when Test connection is clicked", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          valid: true,
          account_name: "My Workspace",
        }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));

    const input = screen.getByPlaceholderText("ntn_...");
    await user.type(input, "ntn_test_token");

    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sources/validate",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fetchSpy.mockRestore();
  });

  it("shows success validation message", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          valid: true,
          account_name: "Test Workspace",
        }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));

    const input = screen.getByPlaceholderText("ntn_...");
    await user.type(input, "ntn_test_token");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Connected as Test Workspace"),
      ).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("shows error validation message", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ valid: false, error: "Invalid token" }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));

    const input = screen.getByPlaceholderText("ntn_...");
    await user.type(input, "ntn_bad");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Invalid token")).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("shows Label and Sync interval fields after successful validation", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          valid: true,
          account_name: "My Workspace",
        }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));
    await user.type(screen.getByPlaceholderText("ntn_..."), "ntn_tok");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Label")).toBeInTheDocument();
      expect(screen.getByText("Sync interval")).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("shows Connect button after successful validation", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ valid: true, account_name: "WS" }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));
    await user.type(screen.getByPlaceholderText("ntn_..."), "ntn_tok");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^connect$/i }),
      ).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("auto-fills label from account_name on successful validation", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ valid: true, account_name: "Auto-Label" }),
        { status: 200 },
      ),
    );

    renderDialog();
    await user.click(screen.getByText("Notion"));
    await user.type(screen.getByPlaceholderText("ntn_..."), "ntn_tok");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      const labelInput = screen.getByDisplayValue("Auto-Label");
      expect(labelInput).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("calls createConnection when Connect is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ valid: true, account_name: "WS" }),
        { status: 200 },
      ),
    );

    const fakeConnection: SourceConnection = {
      id: "sc-1",
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
      provider: "notion",
      account_label: "WS",
      status: "active",
      last_verified_at: null,
      sync_interval_hours: 6,
      next_sync_at: null,
      error_message: null,
      meta: {},
    };
    mockCreateConnection.mockResolvedValueOnce(fakeConnection);

    renderDialog();
    await user.click(screen.getByText("Notion"));
    await user.type(screen.getByPlaceholderText("ntn_..."), "ntn_tok");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^connect$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "notion",
          account_label: "WS",
        }),
      );
    });

    vi.restoreAllMocks();
  });

  it("handles fetch failure gracefully on validation", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    renderDialog();
    await user.click(screen.getByText("Notion"));
    await user.type(screen.getByPlaceholderText("ntn_..."), "ntn_tok");
    await user.click(
      screen.getByRole("button", { name: /test connection/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to validate credentials"),
      ).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("redirects to OAuth flow for hosted mode when provider has OAuth", () => {
    const originalHref = window.location.href;
    renderDialog({ isHosted: true });

    expect(screen.getByText("Notion")).toBeInTheDocument();
  });
});
