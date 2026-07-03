# syntax=docker/dockerfile:1.7

# ---------- Base ----------
# Node 24 + pnpm via corepack. Using a Node base image (rather than the pnpm
# image) ensures `node` is on PATH for lifecycle scripts like protobufjs's
# postinstall.
FROM node:24-slim AS base
WORKDIR /workspace

# Enable pnpm's content-addressable store cache mounts.
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

# Activate pnpm 11 through corepack (bundled with Node).
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# ---------- Deps ----------
# Install workspace dependencies. We copy every package's manifest so pnpm can
# resolve the whole workspace graph, but we do NOT copy source yet, so this
# layer is cached as long as the manifests / lockfile don't change.
FROM base AS deps

# Root workspace manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Package manifests (add more COPY lines here if you add more workspace packages)
COPY packages/liteparse-grpc/package.json ./packages/liteparse-grpc/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Build ----------
FROM deps AS build

# Copy the package source we need to build.
COPY packages/liteparse-grpc ./packages/liteparse-grpc

# esbuild produces dist/server.js with @llamaindex/liteparse, @grpc/grpc-js and
# @bufbuild/protobuf marked as external, so we still need node_modules at
# runtime.
RUN pnpm --filter @llamaindex/liteparse-grpc run build:server

# Prune to production-only dependencies for the runtime image.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @llamaindex/liteparse-grpc deploy --prod --legacy /out

# ---------- Runtime ----------
FROM node:24-slim AS runtime
WORKDIR /app

# System libraries needed for full liteparse functionality
# (libvips for image processing, libreoffice for office docs, imagemagick for
# rasterization, ca-certificates for TLS).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
      ca-certificates \
      libreoffice \
      imagemagick \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Bring in the deployed package (node_modules + package.json) and the built JS.
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /workspace/packages/liteparse-grpc/dist ./dist

EXPOSE 50051

USER node

ENV GRPC_BIND_ADDR="0.0.0.0:50051"

CMD ["node", "dist/server.js"]
