#!/usr/bin/env bash
# Produces an AGPL-compliant source snapshot of the deployed Vichar build:
# the full working tree MINUS the ee/ directory (commercially licensed, must
# not be republished), env files, keys, and local data. Push the result to a
# public repository and set GITHUB_URL in .env.vichar to its URL — the UI
# footer then serves as the written source offer for api.vichar.io.
#
# Usage: infra/export-public-source.sh /tmp/vichar-public
set -euo pipefail

OUT="${1:?output dir required}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$OUT"
git -C "$SRC" archive HEAD | tar -x -C "$OUT"

# ee/ is under the LLMGateway Enterprise License — do not republish.
rm -rf "$OUT/ee"

# Local secrets/data must never be published.
find "$OUT" -name '.env' -o -name '.env.*' ! -name '.env.example' ! -name '.env.vichar.example' | xargs -r rm -f
find "$OUT" \( -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \) -delete
rm -f "$OUT/.envrc" "$OUT/.env.local"

cat > "$OUT/SOURCE-OFFER.md" <<'EOF'
# Corresponding source — Vichar (AGPLv3)

This repository contains the complete corresponding source for the modified
LLM Gateway deployment serving api.vichar.io / app.vichar.io, as required by
the GNU Affero General Public License v3 §13.

The upstream project's `ee/` directory is commercially licensed and is not
redistributed here; the deployed build does not depend on it (audit and
guardrail functionality is provided by the first-party `packages/audit` and
`packages/guardrails` workspaces).

Upstream: https://github.com/theopenco/llmgateway (AGPLv3)
License of this repository: AGPLv3 (see LICENSE)
EOF

echo "Exported sanitized source tree to $OUT"
echo "Next: cd $OUT && git init -b main && git add -A && git commit -m 'vichar source snapshot' && gh repo create <org>/vichar --public --push"
