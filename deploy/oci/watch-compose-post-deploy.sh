#!/usr/bin/env bash
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
APP_BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
APP_BASE_URL="${APP_BASE_URL%/}"
AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$APP_BASE_URL}"
AUTH_BASE_URL="${AUTH_BASE_URL%/}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}"
  -o "BatchMode=yes"
  -o "ConnectTimeout=10"
  -o "ServerAliveInterval=10"
  -o "ServerAliveCountMax=3"
)

shell_quote() {
  printf "%q" "$1"
}

echo "==> [watch] VM compose health"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR")" <<'EOF'
set -euo pipefail
remote_dir="$1"
cd "$remote_dir"
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
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR")" <<'EOF'
set -uo pipefail
remote_dir="$1"
cd "$remote_dir"
matches="$(sudo docker compose -f compose.yml logs --since 10m readmates-api 2>/dev/null \
  | grep -E '[[:space:]]ERROR[[:space:]]' \
  | tail -120 || true)"
if [ -n "$matches" ]; then
  printf '%s\n' "$matches"
  exit 1
fi
EOF

echo "Post-deploy watch passed"
