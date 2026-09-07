#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT}"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

declare -A ENDPOINTS=(
  [watermark]=http://127.0.0.1:3011/health
  [voiceover]=http://127.0.0.1:3012/health
  [remotion]=http://127.0.0.1:3333/health
  [frames]=http://127.0.0.1:3334/health
  [compressor]=http://127.0.0.1:3335/health
  [timing]=http://127.0.0.1:3336/health
  [youtube]=http://127.0.0.1:3340/health
  [pipeline]=http://127.0.0.1:3350/health
)

failed=0
for name in watermark voiceover frames compressor timing remotion youtube pipeline; do
  url="${ENDPOINTS[$name]}"
  if payload="$(curl -fsS --max-time 10 "${url}")"; then
    echo "OK  ${name}  ${payload}"
  else
    echo "FAIL ${name}  ${url}" >&2
    failed=1
  fi
done

exit "${failed}"
