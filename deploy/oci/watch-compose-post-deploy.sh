#!/usr/bin/env bash
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
APP_BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$APP_BASE_URL}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

echo "==> [watch] VM compose health"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
sudo systemctl status readmates-stack --no-pager -l >/dev/null
sudo docker compose -f compose.yml ps
sudo docker compose -f compose.yml exec -T readmates-api curl -fsS --max-time 5 http://127.0.0.1:8080/internal/health >/dev/null
EOF

echo "==> [watch] BFF auth smoke"
curl -fsS --max-time 10 "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null

echo "==> [watch] OAuth and Pages marker smoke"
READMATES_SMOKE_BASE_URL="$APP_BASE_URL" \
READMATES_SMOKE_AUTH_BASE_URL="$AUTH_BASE_URL" \
READMATES_SMOKE_CLUB_HOST="${READMATES_SMOKE_CLUB_HOST:-}" \
./scripts/smoke-production-integrations.sh

echo "==> [watch] recent backend errors"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
error_lines="\$(sudo docker compose -f compose.yml logs --since 10m readmates-api 2>/dev/null | grep -E 'ERROR|Exception|Caused by' || true)"
if [ -n "\$error_lines" ]; then
  echo "\$error_lines" | tail -120
  exit 1
fi
EOF

echo "Post-deploy watch passed"
