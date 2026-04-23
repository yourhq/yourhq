// Detects whether Tailscale is running on the host machine by probing
// the tailscaled LocalAPI socket. The UI container mounts the host's
// tailscaled socket read-only at /var/run/tailscale/tailscaled.sock;
// see docker-compose.yml.
//
// LocalAPI docs: https://tailscale.com/kb/1080/cli#local-api
//
// Returns the device's own identity (IP, hostname, MagicDNS name) so
// the UI can show the user what address to reach HQ at once they
// enable Tailscale.

import "server-only";
import net from "net";

export interface TailscaleStatus {
  running: boolean;
  // Whether tailscaled is installed and responsive. If false, the user
  // hasn't installed Tailscale on the host yet.
  installed: boolean;
  // Whether the device has an active tailnet identity. False if tailscaled
  // is installed but the user hasn't run `tailscale up` / signed in.
  loggedIn: boolean;
  selfIp?: string;
  selfHostname?: string;
  magicDnsName?: string;
  error?: string;
}

const SOCKET_CANDIDATES = [
  process.env.TAILSCALE_SOCKET,
  "/var/run/tailscale/tailscaled.sock",
  "/var/run/tailscaled.socket",
].filter(Boolean) as string[];

// The LocalAPI is HTTP-over-unix-socket. We speak it directly to avoid
// adding a dependency. Request:
//   GET /localapi/v0/status HTTP/1.1
//   Host: local-tailscaled.sock
async function getStatusJson(socketPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const chunks: Buffer[] = [];
    let settled = false;

    const bail = (err: Error) => {
      if (settled) return;
      settled = true;
      conn.destroy();
      reject(err);
    };

    conn.setTimeout(2000, () => bail(new Error("tailscale socket timeout")));
    conn.on("error", bail);
    conn.on("data", (chunk: Buffer) => chunks.push(chunk));
    conn.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf-8");
      // Parse minimal HTTP response — split on \r\n\r\n
      const split = raw.indexOf("\r\n\r\n");
      if (split === -1) return reject(new Error("malformed HTTP response"));
      const head = raw.slice(0, split);
      const body = raw.slice(split + 4);
      const statusLine = head.split("\r\n")[0];
      if (!/^HTTP\/1\.\d 200/.test(statusLine)) {
        return reject(new Error(`tailscale status: ${statusLine}`));
      }
      resolve(body);
    });

    conn.on("connect", () => {
      conn.write(
        "GET /localapi/v0/status HTTP/1.1\r\n" +
          "Host: local-tailscaled.sock\r\n" +
          "Connection: close\r\n" +
          "\r\n",
      );
    });
  });
}

export async function detectTailscale(): Promise<TailscaleStatus> {
  for (const socketPath of SOCKET_CANDIDATES) {
    try {
      const body = await getStatusJson(socketPath);
      const parsed = JSON.parse(body);

      // Tailscale's status JSON has `Self` with TailscaleIPs, HostName, DNSName
      const self = parsed?.Self;
      const backendState = parsed?.BackendState as string | undefined;

      if (!self) {
        return {
          running: true,
          installed: true,
          loggedIn: false,
          error: `tailscaled is running but not signed in (state: ${backendState ?? "unknown"})`,
        };
      }

      const ips: string[] = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
      const selfIp = ips.find((ip) => ip.includes(".")) ?? ips[0];
      const magicDns =
        typeof self.DNSName === "string" ? self.DNSName.replace(/\.$/, "") : undefined;

      return {
        running: true,
        installed: true,
        loggedIn: backendState === "Running",
        selfIp,
        selfHostname: self.HostName,
        magicDnsName: magicDns,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EACCES") {
        // Try next candidate
        continue;
      }
      return {
        running: false,
        installed: false,
        loggedIn: false,
        error: (err as Error).message,
      };
    }
  }
  return {
    running: false,
    installed: false,
    loggedIn: false,
    error: "tailscaled socket not found — Tailscale not installed on this host",
  };
}
