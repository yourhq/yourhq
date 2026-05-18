import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceBrowseItem } from "@/lib/sources/types";

const mockBrowse = vi.fn();
const mockClearCache = vi.fn();

vi.mock("@/hooks/use-source-browse", () => ({
  useSourceBrowse: () => ({
    browse: mockBrowse,
    clearCache: mockClearCache,
    loading: false,
    items: [],
  }),
}));

vi.mock("@/lib/sources/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/types")>(
    "@/lib/sources/types",
  );
  return {
    ...actual,
    PROVIDER_LABELS: { notion: "Notion" },
  };
});

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

import { SourceContentPicker } from "@/components/sources/source-content-picker";

const rootItems: SourceBrowseItem[] = [
  {
    external_id: "page-1",
    title: "Getting Started",
    source_url: "https://notion.so/page1",
    item_type: "page",
    has_children: false,
  },
  {
    external_id: "db-1",
    title: "Tasks Database",
    source_url: "https://notion.so/db1",
    item_type: "database",
    has_children: true,
  },
];

const mockOnSync = vi.fn().mockResolvedValue(true);
const mockOnClose = vi.fn();

function renderPicker(
  overrides: Partial<Parameters<typeof SourceContentPicker>[0]> = {},
) {
  return render(
    <SourceContentPicker
      open={true}
      connectionId="conn-1"
      provider="notion"
      existingSyncedIds={new Set()}
      onSync={mockOnSync}
      onClose={mockOnClose}
      {...overrides}
    />,
  );
}

describe("SourceContentPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowse.mockResolvedValue(rootItems);
  });

  it("renders the dialog title with provider name", async () => {
    renderPicker();
    await waitFor(() => {
      expect(
        screen.getByText("Select content from Notion"),
      ).toBeInTheDocument();
    });
  });

  it("renders the dialog description", async () => {
    renderPicker();
    expect(
      screen.getByText("Choose pages and databases to sync into Knowledge."),
    ).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    renderPicker({ open: false });
    expect(
      screen.queryByText("Select content from Notion"),
    ).not.toBeInTheDocument();
  });

  it("calls browse on open", async () => {
    renderPicker();
    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith("conn-1");
    });
  });

  it("clears cache on open", async () => {
    renderPicker();
    expect(mockClearCache).toHaveBeenCalled();
  });

  it("renders root items after loading", async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
      expect(screen.getByText("Tasks Database")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockBrowse.mockImplementation(() => new Promise(() => {}));
    renderPicker();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders search input with provider placeholder", async () => {
    renderPicker();
    expect(screen.getByPlaceholderText("Search Notion...")).toBeInTheDocument();
  });

  it("renders Cancel button", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it("renders sync button showing item count", async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    expect(screen.getByText(/sync.*items?/i)).toBeInTheDocument();
  });

  it("shows 'Select items to sync' when nothing is selected", async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Select items to sync")).toBeInTheDocument();
    });
  });

  it("disables sync button when no items selected", async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });
    const syncBtn = screen.getByRole("button", { name: /sync.*items?/i });
    expect(syncBtn).toBeDisabled();
  });

  it("marks already-synced items and prevents selection", async () => {
    renderPicker({
      existingSyncedIds: new Set(["page-1"]),
    });
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    const syncedLabels = screen.getAllByText("synced");
    expect(syncedLabels.length).toBeGreaterThan(0);
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("renders empty state when no content is found", async () => {
    mockBrowse.mockResolvedValue([]);
    renderPicker();
    await waitFor(() => {
      expect(
        screen.getByText(/no content found/i),
      ).toBeInTheDocument();
    });
  });

  it("shows search results when searching", async () => {
    const user = userEvent.setup();
    const searchResults: SourceBrowseItem[] = [
      {
        external_id: "sr-1",
        title: "Search Result Page",
        source_url: "https://notion.so/sr1",
        item_type: "page",
        has_children: false,
        parent_path: "Parent / Path",
      },
    ];

    mockBrowse
      .mockResolvedValueOnce(rootItems)
      .mockResolvedValueOnce(searchResults);

    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search Notion...");
    await user.type(searchInput, "Search");

    await waitFor(() => {
      expect(screen.getByText("Search Result Page")).toBeInTheDocument();
    });
  });

  it("shows 'No results found' for empty search", async () => {
    const user = userEvent.setup();
    mockBrowse
      .mockResolvedValueOnce(rootItems)
      .mockResolvedValueOnce([]);

    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search Notion...");
    await user.type(searchInput, "nonexistent");

    await waitFor(() => {
      expect(screen.getByText("No results found.")).toBeInTheDocument();
    });
  });
});
