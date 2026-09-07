#!/usr/bin/env bash
set -euo pipefail

# Oracle Always Free Ampere A1 bootstrap for SM Pipeline media services.
# Run on a fresh Ubuntu image after SSH. Stay at or below 2 OCPU / 12 GB.

SM_REPO_URL="${SM_REPO_URL:-https://github.com/jtl6713/SM-Pipeline-V2.git}"
SM_DIR="${SM_DIR:-/opt/sm-pipeline}"
COMPOSE_DIR="${SM_DIR}/deploy/cloud-vm"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo bash bootstrap-oracle.sh)" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git jq ufw unzip

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

mkdir -p "${SM_DIR}" /opt/sm-pipeline-secrets
if [[ ! -d "${SM_DIR}/.git" ]]; then
  git clone "${SM_REPO_URL}" "${SM_DIR}"
fi

cd "${COMPOSE_DIR}"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created ${COMPOSE_DIR}/.env — fill secrets before compose up." >&2
fi
mkdir -p secrets
if [[ ! -f secrets/google-drive-service-account.json ]]; then
  echo "Place the Drive service-account JSON at ${COMPOSE_DIR}/secrets/google-drive-service-account.json" >&2
fi

cat >/etc/sysctl.d/99-sm-pipeline.conf <<'SYSCTL'
vm.swappiness=10
SYSCTL
sysctl --system >/dev/null || true

echo
echo "Next:"
echo "  1. Paste CLOUDFLARED_TUNNEL_TOKEN and service secrets into ${COMPOSE_DIR}/.env"
echo "  2. Copy Windows runtime secrets (Airtable, Drive, YouTube, OpenAI) into that file"
echo "  3. cd ${COMPOSE_DIR} && docker compose --profile vm up -d --build"
echo "  4. ./verify-health.sh"
echo "  5. ./prove-arm-remotion.sh"
echo "  6. In OCI Console: Budgets -> create a \$1 alert on this compartment"
echo "  7. Confirm the VM shape is VM.Standard.A1.Flex 2 OCPU / 12 GB"
echo "  8. Do not open 3011-3360 in the VCN. SSH only. Traffic stays on the Tunnel."
