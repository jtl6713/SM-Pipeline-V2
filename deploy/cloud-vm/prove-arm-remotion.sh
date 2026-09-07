#!/usr/bin/env bash
set -euo pipefail

# Gate: do not move render.chicagoshining.com until ARM Remotion can render ARM-SMOKE.
# Run on the Ampere VM after `docker compose up -d remotion-renderer`.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT}"

TIMEOUT_SECONDS="${ARM_SMOKE_TIMEOUT_SECONDS:-600}"
HEALTH_URL="${REMOTION_HEALTH_URL:-http://127.0.0.1:3333/health}"
RENDER_URL="${REMOTION_RENDER_URL:-http://127.0.0.1:3333/render}"

echo "Checking Remotion health at ${HEALTH_URL}"
health="$(curl -fsS --max-time 20 "${HEALTH_URL}")"
echo "${health}"
python3 -c 'import json,sys; p=json.loads(sys.stdin.read());
raise SystemExit(0 if p.get("ok") is True else "Remotion /health did not return ok=true")' <<<"${health}"

echo "Submitting ARM-SMOKE render"
job="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
  -d '{"compositionId":"ARM-SMOKE","filename":"arm-smoke.mp4"}' \
  "${RENDER_URL}")"
echo "${job}"
job_id="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["jobId"])' <<<"${job}")"
status_url="http://127.0.0.1:3333/status/${job_id}"

deadline=$((SECONDS + TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  status="$(curl -fsS --max-time 20 "${status_url}")"
  echo "${status}"
  state="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("status") or "")' <<<"${status}")"
  if [[ "${state}" == "completed" ]]; then
    echo "ARM Remotion proof passed for job ${job_id}"
    exit 0
  fi
  if [[ "${state}" == "failed" || "${state}" == "error" ]]; then
    echo "ARM Remotion proof failed. Keep render.chicagoshining.com on Windows." >&2
    exit 2
  fi
  sleep 5
done

echo "Timed out waiting for ARM-SMOKE. Keep Remotion on Windows." >&2
exit 3
