import "server-only";

export const WORKER_URL = process.env.WORKER_URL ?? "http://worker:3001";

const token = process.env.WORKER_INTERNAL_TOKEN;

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
