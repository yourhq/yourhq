FROM node:24-slim AS builder
WORKDIR /app
COPY apps/worker/package.json apps/worker/package-lock.json apps/worker/tsconfig.json ./
RUN npm ci --ignore-scripts
COPY apps/worker/src ./src
RUN npx tsup src/index.ts --format esm --dts

FROM node:24-slim AS production-deps
WORKDIR /app
COPY apps/worker/package.json apps/worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY db/migrations ./db/migrations
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
