# =============================================================================
# UI image — Next.js standalone build. Small (~200MB) final image.
#
# Build context is the monorepo root so we can COPY apps/ui cleanly.
# =============================================================================
FROM node:24-slim AS deps
WORKDIR /app
COPY apps/ui/package.json apps/ui/package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY apps/ui/. .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -m -s /bin/bash nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Projects registry volume (multi-project support, Phase 2)
RUN mkdir -p /config && chown nextjs:nodejs /config
VOLUME ["/config"]

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "node", "server.js"]
