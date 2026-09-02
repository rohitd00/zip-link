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

# The worker's real job is consuming click-analytics jobs from BullMQ over
# the Redis connection — it has no application HTTP endpoints. It does
# optionally bind $PORT if one is set (see healthServer.ts), purely so it
# can be deployed as a Render free-tier "Web Service" (Render discontinued
# free Background Workers); locally and in docker-compose, PORT is never
# set for this service, so no HTTP server starts here at all.
CMD ["npx", "tsx", "apps/worker/src/worker.ts"]
