# =============================================================================
# UI image — Next.js standalone build. Small (~200MB) final image.
#
# Build context is the monorepo root so we can COPY apps/ui cleanly.
# =============================================================================
FROM node:24-slim AS deps
WORKDIR /app
# Copy lockfile explicitly — the wildcard glob silently skips if missing,
# which can produce non-reproducible builds across architectures.
COPY apps/ui/package.json apps/ui/package-lock.json ./
# libc6 needed for Next.js SWC native binaries in slim images.
RUN apt-get update && apt-get install -y --no-install-recommends libc6 \
    && rm -rf /var/lib/apt/lists/*
RUN npm ci --legacy-peer-deps --no-audit --no-fund

FROM node:24-slim AS builder
WORKDIR /app
# Supabase URL + anon key are injected at RUNTIME via window.__HQ_CONFIG__
# (see apps/ui/src/lib/projects/inject-config.tsx). Nothing project-specific
# is baked into the client bundle — the same image works for any user.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=4096"
COPY --from=deps /app/node_modules ./node_modules
COPY apps/ui/. .
RUN npm run build:templates && npx next build --webpack

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# tini — PID 1 reaper
# docker-cli — lets server actions start the local `gateway` compose
#   profile when the user picks "run agents on this machine" during
#   onboarding. Smaller than docker-compose-plugin, but Compose v2 is
#   invoked as `docker compose` — we install the plugin alongside.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      gosu \
      ca-certificates \
      curl \
      gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -m -s /bin/bash nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Onboarding bundles the schema migrations with the image so the UI can
# install them into the user's Supabase the first time they connect a
# project. All .sql files are concatenated at runtime by install-schema.ts.
COPY --chown=nextjs:nodejs db/migrations/ /app/db/migrations/
ENV HQ_SCHEMA_PATH=/app/db/migrations

# Projects registry volume (multi-project support, Phase 2)
RUN mkdir -p /config && chown nextjs:nodejs /config
VOLUME ["/config"]

COPY apps/ui/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
