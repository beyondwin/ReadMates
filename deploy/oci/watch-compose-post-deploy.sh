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
REMOTE_LEDGER="${READMATES_DEPLOY_LEDGER:-/var/log/readmates/deploy-attempts.jsonl}"
WATCH_ATTEMPT_ID="${READMATES_DEPLOY_ATTEMPT_ID:-unknown}"
WATCH_STARTED_EPOCH="$(date -u +%s)"
WATCH_LEDGER_FORMAT="${READMATES_LEDGER_FORMAT:-both}"
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

watch_duration_seconds() {
  local now
  now="$(date -u +%s)"
  echo $((now - WATCH_STARTED_EPOCH))
}

_watch_ledger_remote_emit() {
  local payload="$1"
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "sudo install -d -o root -g readmates -m 0750 /var/log/readmates && sudo touch $(shell_quote "$REMOTE_LEDGER") && sudo chown root:readmates $(shell_quote "$REMOTE_LEDGER") && sudo chmod 0640 $(shell_quote "$REMOTE_LEDGER") && printf '%s\n' $(shell_quote "$payload") | sudo tee -a $(shell_quote "$REMOTE_LEDGER") >/dev/null" \
    || true
}

watch_ledger_emit() {
  local event="$1"
  local status="$2"
  local detail_string="${3:-}"
  local at duration legacy_payload detail_object json_payload
  at="$(utc_now)"
  duration="$(watch_duration_seconds)"

  # legacy format
  legacy_payload="{\"attemptId\":\"$(json_escape "$WATCH_ATTEMPT_ID")\",\"event\":\"$(json_escape "$event")\",\"status\":\"$(json_escape "$status")\",\"stage\":\"post-deploy-watch\",\"at\":\"$at\",\"durationSeconds\":$duration"
  if [ -n "$detail_string" ]; then
    legacy_payload="${legacy_payload},\"detail\":\"$(json_escape "$detail_string")\""
  fi
  legacy_payload="${legacy_payload}}"

  # new json format
  if [ -n "$detail_string" ]; then
    detail_object="$(printf '%s' "$detail_string" | jq -Rn \
      '[inputs | split(" ")[] | select(length > 0) | capture("^(?<k>[^=]+)=(?<v>.*)$") // {k: ., v: ""}] | map({(.k): .v}) | add // {}')"
  else
    detail_object='{}'
  fi
  json_payload="$(jq -nc \
    --arg ts "$at" \
    --arg stage "post-deploy-watch" \
    --arg event "$event" \
    --arg status "$status" \
    --argjson detail "$detail_object" \
    --arg attemptId "$WATCH_ATTEMPT_ID" \
    --argjson durationSeconds "$duration" \
    '{ts:$ts, stage:$stage, event:$event, status:$status, detail:$detail, attemptId:$attemptId, durationSeconds:$durationSeconds}')"

  if [ "$WATCH_LEDGER_FORMAT" != "json" ]; then
    _watch_ledger_remote_emit "$legacy_payload"
  fi
  if [ "$WATCH_LEDGER_FORMAT" != "legacy" ]; then
    _watch_ledger_remote_emit "$json_payload"
  fi
}

watch_ledger_emit "STAGE_STARTED" "RUNNING" "stage=post-deploy-watch"

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
watch_ledger_emit "VM_HEALTH_PASSED" "RUNNING" "endpoint=/internal/health"

echo "==> [watch] BFF auth smoke"
curl -fsS --max-time 10 "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null
watch_ledger_emit "BFF_AUTH_SMOKE_PASSED" "RUNNING" "path=/api/bff/api/auth/me"

echo "==> [watch] OAuth and Pages marker smoke"
READMATES_SMOKE_BASE_URL="$APP_BASE_URL" \
READMATES_SMOKE_AUTH_BASE_URL="$AUTH_BASE_URL" \
READMATES_SMOKE_CLUB_HOST="${READMATES_SMOKE_CLUB_HOST:-}" \
./scripts/smoke-production-integrations.sh
watch_ledger_emit "INTEGRATION_SMOKE_PASSED" "RUNNING" "smoke=oauth-pages"

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
watch_ledger_emit "ERROR_LOG_CHECK_PASSED" "RUNNING" "window=10m"

watch_ledger_emit "WATCH_PASSED" "SUCCESS"
echo "Post-deploy watch passed"
