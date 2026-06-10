#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
compose_file="$repo_root/ops/observability/local/compose.yml"

cd "$repo_root"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'observability-local-smoke: required command not found: %s\n' "$1" >&2
    exit 2
  fi
}

wait_http() {
  local label="$1"
  local url="$2"
  local attempts="${3:-30}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      printf 'OK: %s\n' "$label"
      return 0
    fi
    sleep 2
  done
  printf 'FAILED: %s did not become ready at %s\n' "$label" "$url" >&2
  return 1
}

wait_json_count() {
  local label="$1"
  local url="$2"
  local jq_filter="$3"
  local min_count="$4"
  local attempts="${5:-30}"
  local count
  local i
  for ((i = 1; i <= attempts; i++)); do
    count="$(curl -fsS "$url" | jq "$jq_filter" 2>/dev/null || printf '0')"
    if (( count >= min_count )); then
      printf 'OK: %s %s\n' "$label" "$count"
      return 0
    fi
    sleep 2
  done
  printf 'FAILED: %s expected at least %s, got %s\n' "$label" "$min_count" "${count:-0}" >&2
  return 1
}

require_cmd docker
require_cmd curl
require_cmd jq

docker compose -f "$compose_file" up -d prometheus grafana

wait_http "Prometheus ready" "http://localhost:9090/-/ready"
wait_http "Grafana ready" "http://localhost:3001/api/health"

wait_json_count "Prometheus loaded rule group(s):" "http://localhost:9090/api/v1/rules" '.data.groups | length' 1
wait_json_count "Prometheus readmates-server target(s):" "http://localhost:9090/api/v1/targets" '[.data.activeTargets[] | select(.labels.job == "readmates-server")] | length' 1
wait_json_count "Grafana provisioned dashboard(s):" "http://localhost:3001/api/search?type=dash-db" 'length' 3
