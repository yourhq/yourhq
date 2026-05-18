import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/use-notifications", () => ({
  useUnreadNotificationCount: vi.fn().mockReturnValue({ count: 0 }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => (
    <nav data-testid="breadcrumb">{children}</nav>
  ),
  BreadcrumbList: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  BreadcrumbLink: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <span>{children}</span>,
  BreadcrumbPage: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span data-testid="breadcrumb-page">{children}</span>,
  BreadcrumbSeparator: ({ className }: { className?: string }) => (
    <span>/</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/kbd", () => ({
  Kbd: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <kbd>{children}</kbd>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    align?: string;
    className?: string;
  }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <div data-testid="dropdown-item" onClick={onSelect}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="dropdown-label">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="dropdown-trigger">{children}</div>,
}));

import { HeaderBar } from "@/components/shared/header-bar";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { usePathname } from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePathname).mockReturnValue("/dashboard");
  vi.mocked(useUnreadNotificationCount).mockReturnValue({
    count: 0,
    refresh: vi.fn(),
  });
});

describe("HeaderBar", () => {
  it("renders breadcrumbs from pathname", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/tasks");
    render(<HeaderBar />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("renders multi-level breadcrumbs", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/settings/general");
    render(<HeaderBar />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("shows notification bell", () => {
    render(<HeaderBar />);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("shows unread count badge when there are unread notifications", () => {
    vi.mocked(useUnreadNotificationCount).mockReturnValue({
      count: 5,
      refresh: vi.fn(),
    });
    render(<HeaderBar />);
    expect(
      screen.getByLabelText("Notifications — 5 unread")
    ).toBeInTheDocument();
  });

  it("renders user dropdown when user is provided", () => {
    const user = {
      id: "u1",
      email: "test@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    } as Parameters<typeof HeaderBar>[0]["user"];

    render(<HeaderBar user={user} />);
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("search button calls onOpenCommandPalette", async () => {
    const usr = userEvent.setup();
    const onOpenCommandPalette = vi.fn();
    render(<HeaderBar onOpenCommandPalette={onOpenCommandPalette} />);

    const searchButton = screen.getByLabelText("Search");
    await usr.click(searchButton);
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("maps known module labels from pathname segments", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/crm");
    render(<HeaderBar />);
    expect(screen.getByText("CRM")).toBeInTheDocument();
  });
});
