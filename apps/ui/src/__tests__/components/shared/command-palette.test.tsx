import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/shared/modules-context", () => ({
  useModules: vi.fn().mockReturnValue({ crm: true }),
}));

vi.mock("@/hooks/use-sidebar-collections", () => ({
  useSidebarCollections: vi.fn().mockReturnValue({ collections: [] }),
}));

vi.mock("@/hooks/use-universal-search", () => ({
  useUniversalSearch: vi.fn().mockReturnValue({
    groups: [],
    totalResults: 0,
    searching: false,
  }),
}));

vi.mock("@/lib/search/recent-items", () => ({
  getRecentItems: vi.fn().mockReturnValue([]),
  addRecentItem: vi.fn(),
}));

vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({
    open,
    children,
    onOpenChange,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange: (v: boolean) => void;
    showCloseButton?: boolean;
  }) =>
    open ? (
      <div data-testid="command-dialog">
        {children}
        <button onClick={() => onOpenChange(false)}>close</button>
      </div>
    ) : null,
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <input
      data-testid="command-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    />
  ),
  CommandList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="command-list">{children}</div>
  ),
  CommandGroup: ({
    heading,
    children,
  }: {
    heading?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid={`command-group-${heading}`} role="group" aria-label={heading}>
      <div data-testid="group-heading">{heading}</div>
      {children}
    </div>
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    value?: string;
  }) => (
    <div data-testid="command-item" data-value={value} role="option" onClick={onSelect}>
      {children}
    </div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandSeparator: () => <hr data-testid="command-separator" />,
}));

import { CommandPalette } from "@/components/shared/command-palette";
import { useModules } from "@/components/shared/modules-context";
import { useSidebarCollections } from "@/hooks/use-sidebar-collections";
import { useUniversalSearch } from "@/hooks/use-universal-search";
import { getRecentItems } from "@/lib/search/recent-items";
import { useRouter } from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useModules).mockReturnValue({ crm: true });
  vi.mocked(useSidebarCollections).mockReturnValue({
    collections: [],
  } as ReturnType<typeof useSidebarCollections>);
  vi.mocked(useUniversalSearch).mockReturnValue({
    groups: [],
    totalResults: 0,
    searching: false,
  });
  vi.mocked(getRecentItems).mockReturnValue([]);
});

describe("CommandPalette", () => {
  it("does not render dialog when closed", () => {
    render(<CommandPalette />);
    expect(screen.queryByTestId("command-dialog")).not.toBeInTheDocument();
  });

  it("opens on Cmd+K and renders the dialog", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByTestId("command-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("command-input")).toBeInTheDocument();
  });

  it("shows navigation items when open with no query", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const navGroup = screen.getByTestId("command-group-Navigation");
    expect(navGroup).toBeInTheDocument();

    const items = within(navGroup).getAllByTestId("command-item");
    const labels = items.map((el) => el.textContent);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Agents");
    expect(labels).toContain("Knowledge");
  });

  it("shows quick actions when open with no query", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const actionsGroup = screen.getByTestId("command-group-Quick Actions");
    expect(actionsGroup).toBeInTheDocument();
    const items = within(actionsGroup).getAllByTestId("command-item");
    const labels = items.map((el) => el.textContent);
    expect(labels).toContain("Create Task");
  });

  it("navigates when a nav item is selected", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      forward: vi.fn(),
    });

    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const navGroup = screen.getByTestId("command-group-Navigation");
    const dashboardItem = within(navGroup)
      .getAllByTestId("command-item")
      .find((el) => el.textContent?.includes("Dashboard"));
    expect(dashboardItem).toBeDefined();
    await user.click(dashboardItem!);

    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("shows recent items section when recents exist", async () => {
    const user = userEvent.setup();
    vi.mocked(getRecentItems).mockReturnValue([
      {
        id: "r1",
        type: "task",
        title: "My Recent Task",
        href: "/dashboard/tasks/r1",
        timestamp: Date.now(),
      },
    ]);

    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const recentGroup = screen.getByTestId("command-group-Recent");
    expect(recentGroup).toBeInTheDocument();
    expect(within(recentGroup).getByText("My Recent Task")).toBeInTheDocument();
  });

  it("shows collection items from sidebar", async () => {
    const user = userEvent.setup();
    vi.mocked(useSidebarCollections).mockReturnValue({
      collections: [
        { id: "c1", name: "Leads", slug: "leads", icon: null, color: null },
      ],
    } as ReturnType<typeof useSidebarCollections>);

    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const collectionsGroup = screen.getByTestId("command-group-Collections");
    expect(collectionsGroup).toBeInTheDocument();
    expect(within(collectionsGroup).getByText("Leads")).toBeInTheDocument();
  });

  it("filters CRM items when CRM module is disabled", async () => {
    const user = userEvent.setup();
    vi.mocked(useModules).mockReturnValue({ crm: false });

    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");

    const navGroup = screen.getByTestId("command-group-Navigation");
    const labels = within(navGroup)
      .getAllByTestId("command-item")
      .map((el) => el.textContent);
    expect(labels).not.toContain("Contacts");
    expect(labels).not.toContain("Organizations");
    expect(labels).toContain("Dashboard");
  });

  it("shows search results when query is entered", async () => {
    const user = userEvent.setup();
    vi.mocked(useUniversalSearch).mockReturnValue({
      groups: [
        {
          type: "task" as const,
          label: "Tasks",
          loading: false,
          results: [
            {
              id: "t1",
              type: "task" as const,
              title: "Fix bug",
              href: "/dashboard/tasks/t1",
            },
          ],
        },
      ],
      totalResults: 1,
      searching: false,
    });

    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("command-input"), "Fix");

    expect(screen.getByTestId("command-group-Tasks")).toBeInTheDocument();
    expect(screen.getByText("Fix bug")).toBeInTheDocument();
  });
});
