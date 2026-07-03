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
# until package.json / lockfile change. The full server uses OpenTelemetry,
# Redis and rate-limiter peer dependencies, so we need them installed too.
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/liteparse-grpc/package.json ./packages/liteparse-grpc/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

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

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Bring in the fully-resolved node_modules (including OTel / Redis peer deps)
# and the sources so we can run the TS entrypoints directly with node's
# built-in loader / --import hook.
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/package.json ./package.json
COPY src ./src
COPY tsconfig.json ./tsconfig.json

# Application port (5707) and Prometheus scrape port (9464).
EXPOSE 5707 9464

CMD ["pnpm", "run", "start"]
