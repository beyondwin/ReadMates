#!/usr/bin/env bash
# 05-deploy-compose-stack.sh — Caddy 포함 Docker Compose stack 배포
# 사용법: VM_PUBLIC_IP=1.2.3.4 CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
# shellcheck disable=SC2029,SC2087
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"
: "${CADDY_SITE:?CADDY_SITE 환경변수를 지정하세요. 예: CADDY_SITE=api.example.com}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
APP_BASE_URL="${READMATES_APP_BASE_URL:-https://readmates.pages.dev}"
IMAGE_TAG="${READMATES_SERVER_IMAGE:-readmates-server:local}"
IMAGE_ARCHIVE="${TMPDIR:-/tmp}/readmates-server-image.tar"
COMPOSE_FILE="deploy/oci/compose.yml"
CADDYFILE="deploy/oci/Caddyfile"
SERVICE_FILE="deploy/oci/readmates-stack.service"
REMOTE_DIR="/opt/readmates"
READMATES_RUN_POST_DEPLOY_WATCH="${READMATES_RUN_POST_DEPLOY_WATCH:-true}"
ATTEMPT_ID="${READMATES_DEPLOY_ATTEMPT_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
ATTEMPT_STARTED_EPOCH="$(date -u +%s)"
ATTEMPT_STAGE="init"
REMOTE_LEDGER="${READMATES_DEPLOY_LEDGER:-/var/log/readmates/deploy-attempts.jsonl}"
LEDGER_FORMAT="${READMATES_LEDGER_FORMAT:-both}"

SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")
trap on_deploy_error ERR

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "필수 파일 없음: $path" >&2
    return 1
  fi
}

shell_quote() {
  printf "%q" "$1"
}

uses_registry_image() {
  [[ "$IMAGE_TAG" == ghcr.io/* ]]
}

json_escape() {
  local value="$1"
  value="${value//$'\t'/ }"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  value="$(printf '%s' "$value" | LC_ALL=C tr '\001-\010\013\014\016-\037' ' ')"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

utc_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

duration_seconds() {
  local now
  now="$(date -u +%s)"
  echo $((now - ATTEMPT_STARTED_EPOCH))
}

_ledger_remote_emit() {
  local payload="$1"
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "sudo install -d -o root -g readmates -m 0750 /var/log/readmates && sudo touch $(shell_quote "$REMOTE_LEDGER") && sudo chown root:readmates $(shell_quote "$REMOTE_LEDGER") && sudo chmod 0640 $(shell_quote "$REMOTE_LEDGER") && printf '%s\n' $(shell_quote "$payload") | sudo tee -a $(shell_quote "$REMOTE_LEDGER") >/dev/null" \
    || true
}

remote_ledger_append() {
  local event="$1"
  local status="$2"
  local detail_string="${3:-}"
  local at duration legacy_payload json_payload
  at="$(utc_now)"
  duration="$(duration_seconds)"

  # Always build legacy payload (no jq needed)
  legacy_payload="{\"attemptId\":\"$(json_escape "$ATTEMPT_ID")\",\"event\":\"$(json_escape "$event")\",\"status\":\"$(json_escape "$status")\",\"stage\":\"$(json_escape "$ATTEMPT_STAGE")\",\"at\":\"$at\",\"durationSeconds\":$duration"
  if [ -n "$detail_string" ]; then
    legacy_payload="${legacy_payload},\"detail\":\"$(json_escape "$detail_string")\""
  fi
  legacy_payload="${legacy_payload}}"

  # Only build JSON payload if it will be emitted (jq not needed in legacy mode)
  if [ "$LEDGER_FORMAT" != "legacy" ]; then
    local detail_object json_payload_inner
    if [ -n "$detail_string" ]; then
      detail_object="$(printf '%s' "$detail_string" | jq -Rn \
        '[inputs | split(" ")[] | select(length > 0) | capture("^(?<k>[^=]+)=(?<v>.*)$") // {k: ., v: ""}] | map({(.k): .v}) | add // {}' 2>/dev/null || echo '{}')"
    else
      detail_object='{}'
    fi
    json_payload_inner="$(jq -nc \
      --arg ts "$at" \
      --arg stage "$ATTEMPT_STAGE" \
      --arg event "$event" \
      --arg status "$status" \
      --argjson detail "$detail_object" \
      --arg attemptId "$ATTEMPT_ID" \
      --argjson durationSeconds "$duration" \
      '{ts:$ts, stage:$stage, event:$event, status:$status, detail:$detail, attemptId:$attemptId, durationSeconds:$durationSeconds}' 2>/dev/null || echo '')"
    json_payload="$json_payload_inner"
  else
    json_payload=""
  fi

  if [ "$LEDGER_FORMAT" != "json" ]; then
    _ledger_remote_emit "$legacy_payload"
  fi
  if [ "$LEDGER_FORMAT" != "legacy" ] && [ -n "$json_payload" ]; then
    _ledger_remote_emit "$json_payload"
  fi
}

mark_stage() {
  ATTEMPT_STAGE="$1"
}

on_deploy_error() {
  local exit_code="$?"
  remote_ledger_append "FAILED" "FAILED" "exitCode=${exit_code}"
  exit "$exit_code"
}

mark_stage "preflight"
remote_ledger_append "STARTED" "RUNNING" "image=${IMAGE_TAG}"

echo "==> [1/11] 필수 파일 확인"
require_file "$COMPOSE_FILE"
require_file "$CADDYFILE"
require_file "$SERVICE_FILE"

if uses_registry_image; then
  IMAGE_SOURCE="registry"
  echo "==> [2/11] Docker image source: registry ${IMAGE_TAG}"
else
  IMAGE_SOURCE="local"
  echo "==> [2/11] Docker image build: ${IMAGE_TAG}"
  docker build -t "${IMAGE_TAG}" server
  docker save "${IMAGE_TAG}" -o "${IMAGE_ARCHIVE}"
fi

echo "==> [3/11] VM Docker/Compose 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo docker version >/dev/null && sudo docker compose version >/dev/null"

echo "==> [4/11] DB backup 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo test -d /var/backups/readmates/mysql && sudo find /var/backups/readmates/mysql -type f -name '*.sql.gz' -mtime -2 | grep -q ."

remote_ledger_append "PREFLIGHT_PASSED" "RUNNING" "imageSource=${IMAGE_SOURCE}"

mark_stage "install"
echo "==> [5/11] runtime files 전송"
if ! uses_registry_image; then
  scp "${SSH_OPTIONS[@]}" "$IMAGE_ARCHIVE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-server-image.tar"
fi
scp "${SSH_OPTIONS[@]}" "$COMPOSE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-compose.yml"
scp "${SSH_OPTIONS[@]}" "$CADDYFILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-Caddyfile"
scp "${SSH_OPTIONS[@]}" "$SERVICE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-stack.service"

echo "==> [6/11] VM runtime files 설치"
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
EOF

mark_stage "image"
echo "==> [7/11] Docker image 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$IMAGE_TAG") $(shell_quote "$IMAGE_SOURCE")" <<'EOF'
set -euo pipefail
image_tag="$1"
image_source="$2"
if [ "$image_source" = "registry" ]; then
  sudo docker pull "$image_tag"
else
  sudo docker load -i /tmp/readmates-server-image.tar
  rm -f /tmp/readmates-server-image.tar
fi
EOF

EXPECTED_IMAGE_ID="$(
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "sudo docker image inspect $(shell_quote "$IMAGE_TAG") --format '{{.Id}}'"
)"
remote_ledger_append "IMAGE_ID_RESOLVED" "RUNNING" "imageId=${EXPECTED_IMAGE_ID}"
remote_ledger_append "IMAGE_RESOLVED" "RUNNING" "image=${IMAGE_TAG}"

mark_stage "compose-config"
echo "==> [8/11] compose 설정 검증"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "cd ${REMOTE_DIR} && sudo docker compose -f compose.yml config >/dev/null"

mark_stage "service-stop"
echo "==> [9/11] 기존 host Caddy/Spring 서비스 정지"
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

mark_stage "compose-up"
echo "==> [10/11] compose stack 시작"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
sudo systemctl enable readmates-stack
cd ${REMOTE_DIR}
sudo docker compose -f compose.yml up -d --remove-orphans
sudo systemctl start readmates-stack
sudo docker compose -f compose.yml ps
EOF

RUNNING_IMAGE_ID="$(
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "cd $(shell_quote "$REMOTE_DIR") && container=\$(sudo docker compose -f compose.yml ps -q readmates-api) && sudo docker inspect \"\$container\" --format '{{.Image}}'" \
    || true
)"
if [ -z "$RUNNING_IMAGE_ID" ]; then
  remote_ledger_append "IMAGE_VERIFIED" "FAILED" "reason=running-image-id-empty expectedImageId=${EXPECTED_IMAGE_ID}"
  echo "Failed to resolve running readmates-api image id via docker inspect" >&2
  false
fi
if [ "$RUNNING_IMAGE_ID" != "$EXPECTED_IMAGE_ID" ]; then
  remote_ledger_append "IMAGE_VERIFIED" "FAILED" "expectedImageId=${EXPECTED_IMAGE_ID} runningImageId=${RUNNING_IMAGE_ID}"
  echo "Running readmates-api image mismatch: expected ${EXPECTED_IMAGE_ID}, got ${RUNNING_IMAGE_ID}" >&2
  false
fi
remote_ledger_append "IMAGE_VERIFIED" "RUNNING" "imageId=${RUNNING_IMAGE_ID}"
remote_ledger_append "STACK_STARTED" "RUNNING" "services=compose"

mark_stage "health"
echo "==> [11/11] health smoke"
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

remote_ledger_append "HEALTH_PASSED" "RUNNING" "endpoint=/internal/health"

mark_stage "bff-smoke"
curl -fsS "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null
remote_ledger_append "BFF_SMOKE_PASSED" "RUNNING" "path=/api/bff/api/auth/me"

mark_stage "post-deploy-watch"
if [ "$READMATES_RUN_POST_DEPLOY_WATCH" = "true" ]; then
  READMATES_SMOKE_BASE_URL="$APP_BASE_URL" \
  READMATES_SMOKE_AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$APP_BASE_URL}" \
  VM_PUBLIC_IP="$VM_PUBLIC_IP" \
  SSH_KEY="$SSH_KEY" \
  REMOTE_USER="$REMOTE_USER" \
  SSH_STRICT_HOST_KEY_CHECKING="$SSH_STRICT_HOST_KEY_CHECKING" \
  READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID" \
  ./deploy/oci/watch-compose-post-deploy.sh
  remote_ledger_append "POST_DEPLOY_WATCH_PASSED" "RUNNING" "watch=true"
else
  remote_ledger_append "POST_DEPLOY_WATCH_SKIPPED" "RUNNING" "watch=${READMATES_RUN_POST_DEPLOY_WATCH}"
fi

mark_stage "complete"
remote_ledger_append "SUCCESS" "SUCCESS" "image=${IMAGE_TAG} watch=${READMATES_RUN_POST_DEPLOY_WATCH}"
trap - ERR

echo ""
echo "Compose stack 배포 완료"
echo "VM health: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'cd ${REMOTE_DIR} && sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health'"
echo "Logs: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'sudo docker compose -f ${REMOTE_DIR}/compose.yml logs -f --tail=200'"
