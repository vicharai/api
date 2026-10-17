# syntax=docker/dockerfile:1-labs
# Vichar admin panel image (apps/admin, Next.js standalone) served on :3006.
# Talks to the api over API_BACKEND_URL (server side) and API_URL (browser).
#
# Nothing in this image may embed secrets or .env files — it can be pushed to
# a public registry.
FROM debian:12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    curl \
    bash \
    tar \
    xz-utils \
    git \
    build-essential \
    && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    ASDF_VERSION=v0.18.0 && \
    ASDF_DIR=/root/.asdf && \
    wget -q https://github.com/asdf-vm/asdf/releases/download/${ASDF_VERSION}/asdf-${ASDF_VERSION}-linux-${ARCH}.tar.gz -O /tmp/asdf.tar.gz && \
    mkdir -p $ASDF_DIR && \
    tar -xzf /tmp/asdf.tar.gz -C $ASDF_DIR && \
    rm /tmp/asdf.tar.gz && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV ASDF_VERSION=v0.18.0
ENV ASDF_DIR=/root/.asdf
ENV ASDF_DATA_DIR=${ASDF_DIR}
ENV PATH="${ASDF_DIR}:${ASDF_DATA_DIR}/shims:$PATH"

WORKDIR /app

COPY .tool-versions ./

RUN cat .tool-versions | cut -d' ' -f1 | grep "^[^\#]" | xargs -i asdf plugin add  {} && \
    asdf install && \
    asdf reshim && \
    node -v && \
    pnpm -v

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY --parents packages/*/package.json ./
COPY --parents apps/*/package.json ./
COPY patches/ ./patches/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# .env* must never land in the image
COPY . .
RUN find /app -name ".env*" -type f -delete

# admin... builds the api first, which writes the openapi.json the admin
# client types are generated from.
RUN --mount=type=cache,target=/app/.turbo pnpm exec turbo run build --concurrency=2 --filter=admin...

# Resolve the node binary asdf installed so the runtime stage can copy it.
RUN cp "$(asdf which node)" /usr/local/bin/node

FROM debian:12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tini \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --home /app nextjs

COPY --from=builder /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=builder --chown=nextjs:nextjs /app/apps/admin/.next/standalone ./

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3006
ENV HOSTNAME=0.0.0.0

EXPOSE 3006

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/admin/server.js"]
