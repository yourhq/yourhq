import "server-only";

export const WORKER_URL = process.env.WORKER_URL ?? "http://worker:3001";

const token = process.env.WORKER_INTERNAL_TOKEN;

const DEFAULT_TIMEOUT_MS = 15_000;

export function workerHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function workerFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${WORKER_URL}${path}`, {
      ...fetchInit,
      headers: { ...workerHeaders(), ...fetchInit.headers },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request to internal service timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
