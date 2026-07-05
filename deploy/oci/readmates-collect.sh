#!/usr/bin/env bash
set -uo pipefail

REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
COMPOSE_FILE="${READMATES_COMPOSE_FILE:-${REMOTE_DIR}/compose.yml}"
SERVICE_NAME="${READMATES_STACK_SERVICE:-readmates-stack}"

section() {
  printf '\n===== %s =====\n' "$1"
}

run_or_note() {
  local label="$1"
  shift
  section "$label"
  "$@" 2>&1 || printf '[readmates-collect] command failed: %s\n' "$label"
}

compose_or_note() {
  local label="$1"
  shift
  section "$label"
  if [ ! -f "$COMPOSE_FILE" ]; then
    printf '[readmates-collect] compose file missing: %s\n' "$COMPOSE_FILE"
    return 0
  fi
  sudo docker compose -f "$COMPOSE_FILE" "$@" 2>&1 || printf '[readmates-collect] compose command failed: %s\n' "$label"
}

section "readmates collect metadata"
printf 'Host=%s\n' "$(hostname 2>/dev/null || printf unknown)"
printf 'Date=%s\n' "$(date -Is)"
printf 'Service=%s\n' "$SERVICE_NAME"
printf 'ComposeFile=%s\n' "$COMPOSE_FILE"

run_or_note "uptime" uptime
run_or_note "df -h" df -h
run_or_note "free -m" free -m
run_or_note "vmstat 1 3" vmstat 1 3
run_or_note "systemctl status ${SERVICE_NAME}" systemctl status "$SERVICE_NAME" --no-pager -l

compose_or_note "docker compose ps" ps
compose_or_note "readmates-api logs 10m" logs --since 10m --tail 200 readmates-api
compose_or_note "caddy logs 10m" logs --since 10m --tail 120 caddy

section "readmates-api internal health"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    /app/bin/readmates-http-get 127.0.0.1 8080 /internal/health 2>&1 \
    || printf '[readmates-collect] internal health unavailable\n'
fi

section "readmates-api readiness"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    /app/bin/readmates-http-get 127.0.0.1 8081 /actuator/health/readiness 2>&1 \
    || printf '[readmates-collect] readiness unavailable\n'
fi

section "prometheus metric summary"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    sh -c "/app/bin/readmates-http-get 127.0.0.1 8081 /actuator/prometheus | grep -E '^(http_server_requests_seconds_count|jvm_memory_used_bytes|hikaricp_connections_active|hikaricp_connections_pending|readmates_notifications_outbox_backlog)' | head -80" 2>&1 \
    || printf '[readmates-collect] prometheus summary unavailable\n'
fi

section "recent readmates-api errors"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" logs --since 24h readmates-api 2>/dev/null \
    | grep -E 'ERROR|Exception|Caused by' \
    | tail -80 \
    || printf '[readmates-collect] no recent ERROR/Exception lines found\n'
fi

section "container image summary"
if [ -f "$COMPOSE_FILE" ]; then
  api_container="$(sudo docker compose -f "$COMPOSE_FILE" ps -q readmates-api 2>/dev/null || true)"
  if [ -n "$api_container" ]; then
    sudo docker inspect "$api_container" \
      --format 'Container={{.Name}} ImageId={{.Image}} StartedAt={{.State.StartedAt}} Status={{.State.Status}}' 2>&1 \
      || printf '[readmates-collect] docker inspect failed\n'
  else
    printf '[readmates-collect] readmates-api container not found\n'
  fi
fi

section "collector complete"
