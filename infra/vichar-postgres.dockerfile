# Vichar Postgres: official postgres:17 + pinned WAL-G for WAL archiving and
# base backups to S3-compatible storage (R2 in prod, MinIO in staging).
#
# WAL-G v3.0.9 (released 2026-08-20) is the first stable 3.x series with PG 17
# support confirmed in its release notes. Binary is checksum-verified.
FROM postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826

ARG WALG_VERSION=v3.0.9
ARG WALG_SHA256=51ec330530f98fc3eb4f008fa539d291a2cac51e7076b256472862e45ceff0bd

# libsodium: WALG_LIBSODIUM_KEY encryption. brotli: WALG_COMPRESSION_METHOD.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends libsodium23 brotli curl ca-certificates \
	&& curl -fsSL -o /tmp/wal-g.tar.gz \
		"https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-20.04-amd64.tar.gz" \
	&& echo "${WALG_SHA256}  /tmp/wal-g.tar.gz" | sha256sum -c - \
	&& tar -xzf /tmp/wal-g.tar.gz -C /usr/local/bin \
	&& mv /usr/local/bin/wal-g-pg-20.04-amd64 /usr/local/bin/wal-g \
	&& chmod 755 /usr/local/bin/wal-g \
	&& rm /tmp/wal-g.tar.gz \
	&& apt-get purge -y curl && apt-get autoremove -y \
	&& apt-get clean && rm -rf /var/lib/apt/lists/*

COPY postgres/wal-push.sh /usr/local/bin/wal-push.sh
COPY postgres/vichar-pg-entrypoint.sh /usr/local/bin/vichar-pg-entrypoint.sh
COPY postgres/vichar-postgres.conf /etc/postgresql/vichar.conf
RUN chmod 755 /usr/local/bin/wal-push.sh /usr/local/bin/vichar-pg-entrypoint.sh

ENTRYPOINT ["vichar-pg-entrypoint.sh"]
CMD ["postgres"]
