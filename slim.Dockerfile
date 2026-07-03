# ---------- Base ----------
# Node 24 + pnpm via corepack. Node base (not the pnpm image) so `node` is on
# PATH for lifecycle scripts (protobufjs postinstall etc.).
FROM node:24-slim AS base
WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

# Match the packageManager field in package.json.
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# ---------- Deps ----------
# Install workspace deps with only the manifests present so this layer caches
# until package.json / lockfile change.
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/liteparse-grpc/package.json ./packages/liteparse-grpc/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Build ----------
FROM deps AS build

# Only the sources needed by build:slim.
COPY src ./src
COPY buildscripts ./buildscripts

RUN pnpm run build:slim && chmod +x dist/slim.js

# Produce a self-contained prod-only node_modules for the runtime image.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm deploy --filter @llamaindex/liteparse-rest --prod --legacy /out

# ---------- Runtime ----------
FROM node:24-slim AS runtime
WORKDIR /app

# System libraries needed for full liteparse functionality.
# libreoffice + imagemagick dominate the image size (~800MB); the rest is small.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
      ca-certificates \
      libreoffice \
      imagemagick \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

ENV NODE_ENV=production

# esbuild bundle marks @llamaindex/liteparse, @opentelemetry/api, express,
# multer, and tslog as external, so we still need their runtime deps.
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /workspace/dist ./dist

EXPOSE 5707

USER node

CMD ["node", "dist/slim.js"]
