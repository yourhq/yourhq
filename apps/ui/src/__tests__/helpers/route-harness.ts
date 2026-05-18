interface RouteCallOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
}

export function createMockRequest(url: string, options: RouteCallOptions = {}) {
  const { method = "GET", body, headers = {} } = options;

  const reqInit: RequestInit = { method, headers: new Headers(headers) };
  if (body !== undefined) {
    reqInit.body = JSON.stringify(body);
    (reqInit.headers as Headers).set("content-type", "application/json");
  }

  return new Request(url, reqInit);
}

export async function callRoute(
  handler: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>,
  options: RouteCallOptions = {},
) {
  const { searchParams = {}, params = {} } = options;

  const url = new URL("http://localhost:3000/api/test");
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }

  const req = createMockRequest(url.toString(), options);
  const ctx = { params: Promise.resolve(params) };

  const response = await handler(req, ctx);
  const contentType = response.headers.get("content-type") ?? "";

  let data: unknown = null;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data, headers: response.headers };
}
