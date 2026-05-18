import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/app/dashboard/settings/connections/actions", () => ({
  enqueueConnectionCommand: vi.fn().mockResolvedValue({
    ok: true,
    data: { commandId: "cmd-1" },
  }),
  waitForCommand: vi.fn().mockResolvedValue({
    ok: true,
    data: { status: "done" },
  }),
  getCommandAction: vi.fn().mockResolvedValue({
    ok: true,
    data: { status: "running", payload: {} },
  }),
}));

import { AddConnectionDialog } from "@/components/connections/add-connection-dialog";

const mockOnOpenChange = vi.fn();
const mockOnAdded = vi.fn();

function renderDialog(
  overrides: Partial<Parameters<typeof AddConnectionDialog>[0]> = {},
) {
  return render(
    <AddConnectionDialog
      open={true}
      onOpenChange={mockOnOpenChange}
      gatewayId="gw-1"
      gatewayLabel="Default Gateway"
      onAdded={mockOnAdded}
      {...overrides}
    />,
  );
}

describe("AddConnectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the pick phase with title", () => {
    renderDialog();
    expect(screen.getByText("Add a connection")).toBeInTheDocument();
  });

  it("shows the gateway label in description", () => {
    renderDialog();
    expect(screen.getByText("Default Gateway")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Add a connection")).not.toBeInTheDocument();
  });

  it("renders provider search input", () => {
    renderDialog();
    expect(
      screen.getByPlaceholderText("Search providers"),
    ).toBeInTheDocument();
  });

  it("renders recommended providers group", () => {
    renderDialog();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("shows Anthropic in the provider list", () => {
    renderDialog();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("shows OpenAI in the provider list", () => {
    renderDialog();
    expect(screen.getByText("OpenAI (API key)")).toBeInTheDocument();
  });

  it("shows Google Gemini in the provider list", () => {
    renderDialog();
    expect(screen.getByText("Google Gemini")).toBeInTheDocument();
  });

  it("shows OpenRouter in the provider list", () => {
    renderDialog();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
  });

  it("shows Ollama in the provider list", () => {
    renderDialog();
    expect(screen.getByText("Ollama")).toBeInTheDocument();
  });

  it("shows auth shape tags on providers", () => {
    renderDialog();
    const apiKeyTags = screen.getAllByText("API key");
    expect(apiKeyTags.length).toBeGreaterThan(0);
  });

  it("shows 'Sign in' tag for OAuth providers", () => {
    renderDialog();
    const signInTags = screen.getAllByText("Sign in");
    expect(signInTags.length).toBeGreaterThan(0);
  });

  it("shows 'Local' tag for local URL providers", () => {
    renderDialog();
    const localTags = screen.getAllByText("Local");
    expect(localTags.length).toBeGreaterThan(0);
  });

  it("filters providers by search query", async () => {
    const user = userEvent.setup();
    renderDialog();

    const searchInput = screen.getByPlaceholderText("Search providers");
    await user.type(searchInput, "anthropic");

    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no results", async () => {
    const user = userEvent.setup();
    renderDialog();

    const searchInput = screen.getByPlaceholderText("Search providers");
    await user.type(searchInput, "zzzznonexistent");

    expect(
      screen.getByText(/no providers matching/i),
    ).toBeInTheDocument();
  });

  it("transitions to configure phase when clicking an API key provider", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    await waitFor(() => {
      expect(screen.getByText("API key")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("sk-…")).toBeInTheDocument();
    });
  });

  it("shows back button on configure phase", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    const backBtn = screen.getByRole("button", { name: /back/i });
    expect(backBtn).toBeInTheDocument();
  });

  it("returns to pick phase when clicking back", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sk-…")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByText("Add a connection")).toBeInTheDocument();
    });
  });

  it("shows Cancel and Connect buttons on API key form", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it("shows help URL link for providers that have one", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    const helpLink = screen.getByText(/get an api key from anthropic/i);
    expect(helpLink.closest("a")).toHaveAttribute(
      "href",
      "https://console.anthropic.com/settings/keys",
    );
  });

  it("shows env var info when provider has an envVar", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
  });

  it("transitions to local URL form for Ollama", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Ollama"));

    await waitFor(() => {
      expect(screen.getByText("Base URL")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("http://127.0.0.1:11434")).toBeInTheDocument();
  });

  it("shows token field as optional for local providers", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Ollama"));

    await waitFor(() => {
      expect(screen.getByText(/optional/i)).toBeInTheDocument();
    });
  });

  it("shows the reveal/hide toggle for API key input", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Anthropic"));

    const toggleBtn = screen.getByRole("button", { name: /show key/i });
    expect(toggleBtn).toBeInTheDocument();
  });

  it("renders provider blurbs", () => {
    renderDialog();
    expect(
      screen.getByText(/claude.*sonnet.*opus.*haiku/i),
    ).toBeInTheDocument();
  });

  it("shows run your own section for open models", () => {
    renderDialog();
    expect(screen.getByText("Run your own")).toBeInTheDocument();
  });

  it("renders everything else section", () => {
    renderDialog();
    expect(screen.getByText("Everything else")).toBeInTheDocument();
  });
});
