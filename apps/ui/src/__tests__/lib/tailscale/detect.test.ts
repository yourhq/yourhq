import { describe, test, expect, vi, beforeEach } from "vitest";
import EventEmitter from "events";

vi.mock("server-only", () => ({}));

const { mockCreateConnection } = vi.hoisted(() => {
  return { mockCreateConnection: vi.fn() };
});

vi.mock("net", () => ({
  default: { createConnection: mockCreateConnection },
}));

import { detectTailscale } from "@/lib/tailscale/detect";

function makeConn() {
  const conn = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setTimeout: ReturnType<typeof vi.fn>;
  };
  conn.write = vi.fn();
  conn.destroy = vi.fn();
  conn.setTimeout = vi.fn();
  return conn;
}

function buildHttpResponse(statusCode: number, body: string): string {
  return `HTTP/1.1 ${statusCode} OK\r\nContent-Type: application/json\r\n\r\n${body}`;
}

beforeEach(() => {
  mockCreateConnection.mockReset();
});

describe("detectTailscale", () => {
  test("returns running status with identity when tailscale is running", async () => {
    const statusJson = JSON.stringify({
      BackendState: "Running",
      Self: {
        TailscaleIPs: ["100.64.0.1", "fd7a:115c:a1e0::1"],
        HostName: "my-host",
        DNSName: "my-host.tailnet.ts.net.",
      },
    });

    const conn = makeConn();
    mockCreateConnection.mockReturnValue(conn);

    const promise = detectTailscale();

    await vi.waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled();
    });

    conn.emit("connect");
    conn.emit("data", Buffer.from(buildHttpResponse(200, statusJson)));
    conn.emit("end");

    const result = await promise;
    expect(result.running).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.loggedIn).toBe(true);
    expect(result.selfIp).toBe("100.64.0.1");
    expect(result.selfHostname).toBe("my-host");
    expect(result.magicDnsName).toBe("my-host.tailnet.ts.net");
  });

  test("returns installed but not logged in when Self is null", async () => {
    const statusJson = JSON.stringify({
      BackendState: "NeedsLogin",
      Self: null,
    });

    const conn = makeConn();
    mockCreateConnection.mockReturnValue(conn);

    const promise = detectTailscale();

    await vi.waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled();
    });

    conn.emit("connect");
    conn.emit("data", Buffer.from(buildHttpResponse(200, statusJson)));
    conn.emit("end");

    const result = await promise;
    expect(result.running).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.loggedIn).toBe(false);
    expect(result.error).toContain("not signed in");
  });

  test("returns not installed when all sockets give ENOENT", async () => {
    mockCreateConnection.mockImplementation(() => {
      const conn = makeConn();
      process.nextTick(() => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        conn.emit("error", err);
      });
      return conn;
    });

    const status = await detectTailscale();
    expect(status.running).toBe(false);
    expect(status.installed).toBe(false);
    expect(status.error).toContain("socket not found");
  });

  test("returns error for non-ENOENT/EACCES errors", async () => {
    mockCreateConnection.mockImplementation(() => {
      const conn = makeConn();
      process.nextTick(() => {
        const err = new Error("Connection refused") as NodeJS.ErrnoException;
        err.code = "ECONNREFUSED";
        conn.emit("error", err);
      });
      return conn;
    });

    const status = await detectTailscale();
    expect(status.running).toBe(false);
    expect(status.installed).toBe(false);
    expect(status.error).toBe("Connection refused");
  });

  test("strips trailing dot from DNSName", async () => {
    const statusJson = JSON.stringify({
      BackendState: "Running",
      Self: {
        TailscaleIPs: ["100.64.0.1"],
        HostName: "box",
        DNSName: "box.mynet.ts.net.",
      },
    });

    const conn = makeConn();
    mockCreateConnection.mockReturnValue(conn);

    const promise = detectTailscale();

    await vi.waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled();
    });

    conn.emit("connect");
    conn.emit("data", Buffer.from(buildHttpResponse(200, statusJson)));
    conn.emit("end");

    const result = await promise;
    expect(result.magicDnsName).toBe("box.mynet.ts.net");
  });

  test("prefers IPv4 address", async () => {
    const statusJson = JSON.stringify({
      BackendState: "Running",
      Self: {
        TailscaleIPs: ["fd7a:115c:a1e0::1", "100.64.0.5"],
        HostName: "h",
        DNSName: "h.ts.net.",
      },
    });

    const conn = makeConn();
    mockCreateConnection.mockReturnValue(conn);

    const promise = detectTailscale();

    await vi.waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled();
    });

    conn.emit("connect");
    conn.emit("data", Buffer.from(buildHttpResponse(200, statusJson)));
    conn.emit("end");

    const result = await promise;
    expect(result.selfIp).toBe("100.64.0.5");
  });
});
