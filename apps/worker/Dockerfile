# Built from the repository root as the build context — see
# apps/api/Dockerfile's header comment for why (no npm workspaces, one
# shared root package.json/node_modules across every service).
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# The worker has no HTTP server and exposes no port; it only consumes jobs
# from the click-analytics BullMQ queue over the Redis connection.
CMD ["npx", "tsx", "apps/worker/src/worker.ts"]
