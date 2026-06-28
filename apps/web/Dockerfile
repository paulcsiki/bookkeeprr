# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22
ARG BOOKKEEPRR_COMMIT=dev
ARG BOOKKEEPRR_BUILT_AT=local

# --- deps stage ---
# Build context = monorepo root. Install all workspace deps.
# We copy full packages source (not just package.json) so workspace
# symlinks resolve correctly and packages/<pkg>/node_modules get
# populated for packages with direct deps (ui → clsx + tailwind-merge,
# types → zod).
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/tokens/ packages/tokens/
COPY packages/types/ packages/types/
COPY packages/logic/ packages/logic/
COPY packages/ui/ packages/ui/
COPY patches/ patches/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# --- prod-deps stage ---
# Use `pnpm deploy` to produce a symlink-free, self-contained node_modules
# for the web app. This is necessary because pnpm workspace installs use
# symlinks into .pnpm that don't resolve correctly when pino's transport
# target resolution (require.resolve of "pino-roll") walks up from the
# standalone-emitted /app/node_modules/.pnpm tree. `pnpm deploy` flattens
# everything into a real node_modules that Node can resolve without symlinks.
#
# Workspace packages (@bookkeeprr/*) are compiled into the Next.js standalone
# output and worker bundles at build time. pnpm deploy needs their source
# present to resolve the workspace graph; their compiled output lives in the
# standalone tree, not in node_modules.
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/tokens/ packages/tokens/
COPY packages/types/ packages/types/
COPY packages/logic/ packages/logic/
COPY packages/ui/ packages/ui/
COPY patches/ patches/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter @bookkeeprr/web --prod /deploy/web

# --- build stage ---
# Copy source first, then overlay node_modules from deps. The packages/
# overlay brings each shared package's node_modules (for packages that
# have direct deps — pnpm only creates per-package node_modules where
# needed). Without this, Next can't resolve clsx / tailwind-merge for
# @bookkeeprr/ui.
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
ARG BOOKKEEPRR_COMMIT
ARG BOOKKEEPRR_BUILT_AT
ENV NEXT_TELEMETRY_DISABLED=1 \
    BOOKKEEPRR_COMMIT=${BOOKKEEPRR_COMMIT} \
    BOOKKEEPRR_BUILT_AT=${BOOKKEEPRR_BUILT_AT}
RUN pnpm --filter @bookkeeprr/web build

# --- runtime stage ---
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ARG BOOKKEEPRR_COMMIT
ARG BOOKKEEPRR_BUILT_AT
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BOOKKEEPRR_CONFIG_DIR=/config \
    BOOKKEEPRR_MEDIA_ROOT=/media \
    BOOKKEEPRR_7Z_BIN=7z \
    BOOKKEEPRR_COMMIT=${BOOKKEEPRR_COMMIT} \
    BOOKKEEPRR_BUILT_AT=${BOOKKEEPRR_BUILT_AT} \
    HOSTNAME=0.0.0.0

# Runtime tools
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates p7zip-full wget \
 && rm -rf /var/lib/apt/lists/*

# Next.js standalone output. Next standalone for an app at apps/web/
# emits the runtime tree at .next/standalone/apps/web/ with a sibling
# .next/standalone/node_modules — we flatten it into / and adjust HOSTNAME below.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

# Worker bundle and migrations. Place both under apps/web/ so that:
# 1. Node's module resolution walks up to apps/web/node_modules/
#    (better-sqlite3, @node-rs/argon2, etc.)
# 2. Relative paths in worker.cjs (e.g. ./drizzle) resolve from WORKDIR
#    /app/apps/web rather than /app.
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/drizzle ./apps/web/drizzle

# Externalized worker deps that Next standalone tracing misses.
# (pino-roll, pino-pretty, pino/file are string-keyed in src/server/logger.ts)
# Uses the symlink-free tree from `pnpm deploy` so pino's runtime
# require.resolve() of transport targets works without workspace symlinks.
#
# We overlay the deploy tree in TWO places:
#  - ./apps/web/node_modules — for the app's own runtime resolution
#    (server.js + route handlers walking up from /app/apps/web/).
#  - ./node_modules — for pino's worker thread, which runs at
#    /app/node_modules/.pnpm/pino@10.3.1/node_modules/pino/lib/worker.js
#    and walks up only through /app/node_modules/. Next standalone tracing
#    skips pino's worker-thread-only transitive deps (pino-abstract-transport,
#    process-warning, real-require), so the worker thread crashes the first
#    time something logs. The deploy overlay backfills those.
COPY --from=prod-deps /deploy/web/node_modules ./apps/web/node_modules
COPY --from=prod-deps /deploy/web/node_modules ./node_modules

# Entrypoint
COPY apps/web/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Next standalone server.js lives at apps/web/server.js inside the standalone tree
WORKDIR /app/apps/web
VOLUME ["/config", "/media"]
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
