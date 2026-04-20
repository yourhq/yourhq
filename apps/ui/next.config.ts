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
};

export default nextConfig;
