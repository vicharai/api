# syntax=docker/dockerfile:1-labs
# Vichar app image: ui + docs + api + gateway + worker under supervisord,
# WITHOUT postgres and redis (they run as separate compose services).
# Derived from unified.vichar.dockerfile with the database stack removed.
#
# Nothing in this image may embed secrets or .env files — it can be pushed to
# a public registry.
FROM debian:12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    curl \
    bash \
    tar \
    xz-utils \
    supervisor \
    tini \
    gosu \
    git \
    && \
    # Install asdf version manager
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    ASDF_VERSION=v0.18.0 && \
    ASDF_DIR=/root/.asdf && \
    wget -q https://github.com/asdf-vm/asdf/releases/download/${ASDF_VERSION}/asdf-${ASDF_VERSION}-linux-${ARCH}.tar.gz -O /tmp/asdf.tar.gz && \
    mkdir -p $ASDF_DIR && \
    tar -xzf /tmp/asdf.tar.gz -C $ASDF_DIR && \
    rm /tmp/asdf.tar.gz && \
    apt-get remove -y build-essential wget gnupg lsb-release \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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

RUN --mount=type=cache,target=/app/.turbo pnpm exec turbo run build --concurrency=2 --filter=!web

RUN cp -r /app/packages/db/migrations /app/apps/api/migrations

RUN mkdir -p /var/log/supervisor /run/postgresql

COPY infra/supervisord.vichar-app.conf /etc/supervisor/conf.d/supervisord.conf
RUN mkdir -p /etc/supervisor/conf.d/extra.d

COPY infra/start-app.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3002 3005 4001 4002

ENV NODE_ENV=production
ENV TELEMETRY_ACTIVE=false
ENV RUN_MIGRATIONS=true
ENV VICHAR_WORKER_AUTOSTART=true

ENTRYPOINT ["/usr/bin/tini", "--"]

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

CMD ["/start.sh"]
