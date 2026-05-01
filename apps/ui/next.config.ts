import type { NextConfig } from "next";

// Allow Codespaces and other reverse-proxy hostnames (comma-separated) to
// pass through Next.js's Server Actions origin check. The platform sends
// x-forwarded-host = <codespace-name>-<port>.app.github.dev while origin
// remains localhost:<port>, which trips the CSRF guard.
const extraAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const codespacesHost = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME}-${process.env.PORT || 3000}.${
      process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev"
    }`
  : null;

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        ...(codespacesHost ? [codespacesHost] : []),
        ...extraAllowedOrigins,
      ],
    },
  },
  async rewrites() {
    return [
      {
        source: "/desktop/:path*",
        destination: `${process.env.GATEWAY_NOVNC_URL || "http://gateway:6901"}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/((?!desktop/).*)",
        headers: [
          // Prevent clickjacking and embedded-iframe attacks. HQ never
          // needs to be iframed into another origin. Excluded from
          // /desktop/* so the noVNC iframe can load through the proxy.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Block MIME sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Force HTTPS for a year once seen (only takes effect on HTTPS
          // responses; safe on HTTP loopback installs).
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Don't leak full referrer URLs to cross-origin requests.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable dangerous browser features we don't use.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
