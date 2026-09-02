# Built from the repository root as the build context (see
# docker-compose.yml's `context: .` / `dockerfile: apps/api/Dockerfile`),
# because this project does not use npm workspaces — every service shares
# one root package.json and node_modules (see README's "Why not npm
# workspaces" note). This image runs the API through `tsx` directly rather
# than a separate compile-to-JS step, matching how `npm run dev:api` already
# runs it; the trade-off is a larger image (dev dependencies included)
# in exchange for one simple, well-understood run path in every environment.
FROM node:24-alpine

WORKDIR /app

# Installing dependencies before copying source code lets Docker reuse this
# layer on every rebuild that only changes application code, not
# package.json/package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Migrations and the partition-maintenance script ship in this image too,
# so an operator can run them against this exact deployed schema version
# via `docker compose exec api npm run migrate:up` / `maintain:partitions`
# without needing a separate migration image or a local Node install.
COPY database ./database
COPY scripts ./scripts

# Run as a non-root user rather than the image's default root account.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["npx", "tsx", "apps/api/src/server.ts"]
