#!/usr/bin/env bash
# 05-deploy-compose-stack.sh — Caddy 포함 Docker Compose stack 배포
# 사용법: VM_PUBLIC_IP=1.2.3.4 CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"
: "${CADDY_SITE:?CADDY_SITE 환경변수를 지정하세요. 예: CADDY_SITE=api.example.com}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
APP_BASE_URL="${READMATES_APP_BASE_URL:-https://readmates.pages.dev}"
IMAGE_TAG="${READMATES_SERVER_IMAGE:-readmates-server:local}"
IMAGE_ARCHIVE="${TMPDIR:-/tmp}/readmates-server-image.tar"
JAR_PATH="server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar"
COMPOSE_FILE="deploy/oci/compose.yml"
CADDYFILE="deploy/oci/Caddyfile"
SERVICE_FILE="deploy/oci/readmates-stack.service"
REMOTE_DIR="/opt/readmates"

SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "필수 파일 없음: $path" >&2
    exit 1
  fi
}

shell_quote() {
  printf "%q" "$1"
}

echo "==> [1/9] 필수 파일 확인"
require_file "$JAR_PATH"
require_file "$COMPOSE_FILE"
require_file "$CADDYFILE"
require_file "$SERVICE_FILE"

echo "==> [2/9] Docker image build: ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" server
docker save "${IMAGE_TAG}" -o "${IMAGE_ARCHIVE}"

echo "==> [3/9] VM Docker/Compose 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo docker version >/dev/null && sudo docker compose version >/dev/null"

echo "==> [4/9] runtime files 전송"
scp "${SSH_OPTIONS[@]}" "$IMAGE_ARCHIVE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-server-image.tar"
scp "${SSH_OPTIONS[@]}" "$COMPOSE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-compose.yml"
scp "${SSH_OPTIONS[@]}" "$CADDYFILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-Caddyfile"
scp "${SSH_OPTIONS[@]}" "$SERVICE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-stack.service"

echo "==> [5/9] VM runtime files 설치"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR") $(shell_quote "$CADDY_SITE") $(shell_quote "$IMAGE_TAG")" <<'EOF'
set -euo pipefail
remote_dir="$1"
caddy_site="$2"
image_tag="$3"
sudo mkdir -p "$remote_dir" /etc/readmates
sudo mv /tmp/readmates-compose.yml "$remote_dir/compose.yml"
sudo mv /tmp/readmates-Caddyfile "$remote_dir/Caddyfile"
sudo mv /tmp/readmates-stack.service /etc/systemd/system/readmates-stack.service
printf 'CADDY_SITE=%s\n' "$caddy_site" | sudo tee /etc/readmates/caddy.env >/dev/null
sudo chmod 600 /etc/readmates/caddy.env
printf 'READMATES_SERVER_IMAGE=%s\n' "$image_tag" | sudo tee "$remote_dir/.env" >/dev/null
sudo chmod 600 "$remote_dir/.env"
sudo chown -R readmates:readmates "$remote_dir"
sudo systemctl daemon-reload
sudo docker load -i /tmp/readmates-server-image.tar
rm -f /tmp/readmates-server-image.tar
EOF

echo "==> [6/9] compose 설정 검증"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "cd ${REMOTE_DIR} && sudo docker compose -f compose.yml config >/dev/null"

echo "==> [7/10] DB backup 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo test -d /var/backups/readmates/mysql && sudo find /var/backups/readmates/mysql -type f -name '*.sql.gz' -mtime -2 | grep -q ."

echo "==> [8/10] 기존 host Caddy/Spring 서비스 정지"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<'EOF'
set -euo pipefail
if systemctl list-unit-files readmates-server.service >/dev/null 2>&1; then
  sudo systemctl stop readmates-server || true
  sudo systemctl disable readmates-server || true
fi
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  sudo systemctl stop caddy || true
  sudo systemctl disable caddy || true
fi
EOF

echo "==> [9/10] compose stack 시작"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
sudo systemctl enable readmates-stack
cd ${REMOTE_DIR}
sudo docker compose -f compose.yml up -d --remove-orphans
sudo docker compose -f compose.yml ps
EOF

echo "==> [10/10] health smoke"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd ${REMOTE_DIR}
for i in \$(seq 1 40); do
  if sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health; then
    exit 0
  fi
  sleep 3
done
sudo docker compose -f compose.yml logs --tail=200 readmates-api
exit 1
EOF

curl -fsS "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null

echo ""
echo "Compose stack 배포 완료"
echo "VM health: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'cd ${REMOTE_DIR} && sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health'"
echo "Logs: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'sudo docker compose -f ${REMOTE_DIR}/compose.yml logs -f --tail=200'"
