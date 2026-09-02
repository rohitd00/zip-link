# Built from the repository root as the build context — see
# apps/api/Dockerfile's header comment for why (no npm workspaces, one
# shared root package.json/node_modules across every service).
#
# Unlike the API/worker images, the dashboard genuinely has a build step
# (Vite produces a static bundle), so this one really does benefit from a
# two-stage build: the first stage needs the full node_modules to run Vite,
# but the final image only ever needs the built static files plus nginx.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN npm run build:web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
