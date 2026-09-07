#!/usr/bin/env bash
set -euo pipefail

# Promote an approved Git SHA into one cloud-vm compose service.
# Usage: ./deploy-one-service.sh watermark <sha>
#        ./deploy-one-service.sh remotion-renderer origin/main

SERVICE="${1:?service name (compose service, e.g. watermark)}"
SHA="${2:?approved git ref or sha}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "${ROOT}"
git fetch origin
git checkout --detach "${SHA}"
cd "${COMPOSE_DIR}"
docker compose up -d --build "${SERVICE}"
echo "Deployed ${SERVICE} from $(git -C "${ROOT}" rev-parse --short HEAD)"
