import { vi } from "vitest";

// Stub next/headers (used by server actions and API routes)
vi.mock("next/headers", () => {
  const cookieStore = new Map<string, string>();
  return {
    cookies: vi.fn().mockReturnValue({
      get: (name: string) => {
        const v = cookieStore.get(name);
        return v ? { name, value: v } : undefined;
      },
      set: (name: string, value: string) => cookieStore.set(name, value),
      delete: (name: string) => cookieStore.delete(name),
      getAll: () =>
        [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
      has: (name: string) => cookieStore.has(name),
    }),
    headers: vi.fn().mockReturnValue(new Map()),
  };
});

// Stub next/navigation (used by hooks and components)
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn().mockReturnValue("/dashboard"),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
  useParams: vi.fn().mockReturnValue({}),
  redirect: vi.fn(),
}));

// Stub next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Stub ResizeObserver (used by many UI components)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Stub IntersectionObserver
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// Stub window.matchMedia (used by theme/responsive components)
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
