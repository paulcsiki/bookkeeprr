# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

# --- build stage ---
# Build context = monorepo root. Install all workspace deps so the
# build resolves @bookkeeprr/* workspace packages.
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/website/package.json apps/website/
COPY packages/tokens/package.json packages/tokens/
COPY packages/types/package.json packages/types/
COPY packages/logic/package.json packages/logic/
COPY packages/ui/package.json packages/ui/
# The root package.json declares pnpm.patchedDependencies for
# react-native-track-player; pnpm reads the patch file at install time
# even on workspaces that don't depend on it. Copy patches/ before the
# install or pnpm errors with ENOENT and the build aborts.
COPY patches/ patches/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @bookkeeprr/website...

COPY apps/website apps/website
COPY packages packages

RUN pnpm --filter @bookkeeprr/website build

# --- runtime stage ---
# Caddy serving the static export. HTTP/2, auto-compression,
# automatic HTTPS (only when behind a domain + valid cert).
FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/website/out /srv
COPY apps/website/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
