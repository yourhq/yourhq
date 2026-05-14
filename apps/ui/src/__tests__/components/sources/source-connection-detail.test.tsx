import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceConnection, SourceSyncRun } from "@/lib/sources/types";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockActions = {
  fetchConnectionItems: vi.fn().mockResolvedValue([]),
  fetchSyncRuns: vi.fn().mockResolvedValue([]),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  stopSyncingItem: vi.fn().mockResolvedValue(undefined),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  updateConnection: vi.fn().mockResolvedValue(undefined),
  syncItemNow: vi.fn(),
  addSyncItems: vi.fn().mockResolvedValue(true),
  createConnection: vi.fn(),
};

vi.mock("@/hooks/use-source-connections", () => ({
  useSourceConnections: () => ({
    connections: [],
    syncRuns: [] as SourceSyncRun[],
    loading: false,
    getConnection: (id: string) => null,
    actions: mockActions,
  }),
}));

vi.mock("@/lib/sources/generated-manifests", () => ({
  PROVIDER_MANIFESTS: {
    notion: {
      id: "notion",
      name: "Notion",
      description: "Sync pages and databases",
      icon: "N",
      auth: { type: "api_key", fields: [], setup_steps: [] },
      supports_write: false,
    },
  },
}));

vi.mock("@/lib/sources/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/types")>(
    "@/lib/sources/types",
  );
  return {
    ...actual,
    PROVIDER_LABELS: { notion: "Notion" },
    CONNECTION_STATUS_LABELS: {
      active: "Active",
      expired: "Expired",
      revoked: "Revoked",
      error: "Error",
    },
    CONNECTION_STATUS_COLORS: {
      active: "bg-green-500/20 text-green-400",
      expired: "bg-red-500/20 text-red-400",
      revoked: "bg-red-500/20 text-red-400",
      error: "bg-red-500/20 text-red-400",
    },
    getSourceUrl: () => "https://notion.so/page123",
  };
});

vi.mock("@/components/shared/detail-header", () => ({
  DetailHeader: ({ identityTitle, identityMeta }: any) => (
    <div data-testid="detail-header">
      <span>{identityTitle}</span>
      {identityMeta}
    </div>
  ),
}));

vi.mock("@/components/shared/detail-sidebar", () => ({
  DetailSidebar: ({ children }: any) => (
    <div data-testid="detail-sidebar">{children}</div>
  ),
  DetailSidebarMobile: ({ children }: any) => (
    <div data-testid="detail-sidebar-mobile">{children}</div>
  ),
  DetailSidebarSection: ({ title, children }: any) => (
    <div data-testid={`sidebar-section-${title}`}>
      <span>{title}</span>
      {children}
    </div>
  ),
  DetailSidebarPropertyGrid: ({ children }: any) => <div>{children}</div>,
  DetailSidebarProperty: ({ label, children }: any) => (
    <div data-testid={`property-${label}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-delete-dialog", () => ({
  ConfirmDeleteDialog: ({ open, title, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-delete">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/sources/source-content-picker", () => ({
  SourceContentPicker: ({ open }: any) =>
    open ? <div data-testid="content-picker">Picker</div> : null,
}));

import { SourceConnectionDetail } from "@/components/sources/source-connection-detail";

function makeConnection(
  overrides: Partial<SourceConnection> = {},
): SourceConnection {
  return {
    id: "sc-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    provider: "notion",
    account_label: "My Notion",
    credentials: {},
    status: "active",
    last_verified_at: "2025-01-01T00:00:00Z",
    sync_interval_hours: 6,
    next_sync_at: null,
    error_message: null,
    meta: {},
    ...overrides,
  };
}

describe("SourceConnectionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the connection label in the header", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    const labels = screen.getAllByText("My Notion");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the provider name in the sidebar", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Notion")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    const badges = screen.getAllByText("Active");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Items tab by default", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Items")).toBeInTheDocument();
  });

  it("renders the Sync History tab button", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Sync History")).toBeInTheDocument();
  });

  it("renders Sync now button in sidebar", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });

  it("renders Disconnect button in sidebar", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("fetches items and sync runs on mount", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(mockActions.fetchConnectionItems).toHaveBeenCalledWith("sc-1");
    expect(mockActions.fetchSyncRuns).toHaveBeenCalledWith("sc-1");
  });

  it("calls triggerSync when Sync now is clicked", async () => {
    const user = userEvent.setup();
    render(<SourceConnectionDetail connection={makeConnection()} />);
    const syncButtons = screen.getAllByText("Sync now");
    await user.click(syncButtons[0]);
    expect(mockActions.triggerSync).toHaveBeenCalledWith("sc-1");
  });

  it("shows delete confirmation when Disconnect is clicked", async () => {
    const user = userEvent.setup();
    render(<SourceConnectionDetail connection={makeConnection()} />);
    const disconnectBtn = screen.getByText("Disconnect");
    await user.click(disconnectBtn);

    expect(screen.getByTestId("confirm-delete")).toBeInTheDocument();
    expect(screen.getByText("Disconnect source?")).toBeInTheDocument();
  });

  it("calls deleteConnection and navigates on disconnect confirm", async () => {
    const user = userEvent.setup();
    render(<SourceConnectionDetail connection={makeConnection()} />);
    await user.click(screen.getByText("Disconnect"));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockActions.deleteConnection).toHaveBeenCalledWith("sc-1");
    });
  });

  it("shows Add button on items tab", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("opens content picker when Add is clicked", async () => {
    const user = userEvent.setup();
    render(<SourceConnectionDetail connection={makeConnection()} />);
    await user.click(screen.getByText("Add"));

    expect(screen.getByTestId("content-picker")).toBeInTheDocument();
  });

  it("renders the Connection sidebar section with label", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByTestId("sidebar-section-Connection")).toBeInTheDocument();
    expect(screen.getByTestId("property-Label")).toBeInTheDocument();
  });

  it("renders the Settings sidebar section", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    expect(screen.getByTestId("sidebar-section-Settings")).toBeInTheDocument();
    expect(screen.getByTestId("property-Sync every")).toBeInTheDocument();
  });

  it("renders masked token display", () => {
    render(<SourceConnectionDetail connection={makeConnection()} />);
    const tokenProps = screen.getAllByTestId("property-Token");
    expect(tokenProps.length).toBeGreaterThan(0);
  });

  it("renders with expired status", () => {
    render(
      <SourceConnectionDetail
        connection={makeConnection({ status: "expired" })}
      />,
    );
    const badges = screen.getAllByText("Expired");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with error status", () => {
    render(
      <SourceConnectionDetail
        connection={makeConnection({ status: "error" })}
      />,
    );
    const badges = screen.getAllByText("Error");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
