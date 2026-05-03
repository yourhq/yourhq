FROM node:24-slim AS builder
WORKDIR /app
COPY apps/worker/package.json apps/worker/tsconfig.json ./
RUN npm install
COPY apps/worker/src ./src
RUN npx tsup src/index.ts --format esm --dts

FROM node:24-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY db/migrations ./db/migrations
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
