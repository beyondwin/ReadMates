#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
compose_file="$repo_root/ops/observability/local/compose.yml"
project="readmates-observability-smoke-$$"
mysql_container="${project}-mysql"
server_port="${READMATES_LOCAL_SERVER_MANAGEMENT_PORT:-8081}"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/readmates-observability-smoke.XXXXXX")"
server_pid=""

cd "$repo_root"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'observability-local-smoke: required command not found: %s\n' "$1" >&2
    exit 2
  }
}

free_port() {
  python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

port_is_free() {
  python3 - "$1" <<'PY'
import socket
import sys
with socket.socket() as sock:
    try:
        sock.bind(("127.0.0.1", int(sys.argv[1])))
    except OSError:
        raise SystemExit(1)
PY
}

wait_http() {
  local label="$1" url="$2" attempts="${3:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      printf 'OK: %s\n' "$label"
      return 0
    fi
    sleep 1
  done
  printf 'FAILED: %s did not become ready at %s\n' "$label" "$url" >&2
  return 1
}

wait_json_count() {
  local label="$1" url="$2" filter="$3" minimum="$4" attempts="${5:-60}"
  local count=0 i
  for ((i = 1; i <= attempts; i++)); do
    count="$(curl -fsS "$url" 2>/dev/null | jq "$filter" 2>/dev/null || printf '0')"
    if (( count >= minimum )); then
      printf 'OK: %s %s\n' "$label" "$count"
      return 0
    fi
    sleep 1
  done
  printf 'FAILED: %s expected at least %s, got %s\n' "$label" "$minimum" "$count" >&2
  return 1
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  docker compose -p "$project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$mysql_container" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

for command in docker curl jq python3; do require_cmd "$command"; done
docker info >/dev/null
port_is_free "$server_port" || {
  printf 'observability-local-smoke: management port %s is already in use; set READMATES_LOCAL_SERVER_MANAGEMENT_PORT only with a matching local Prometheus target\n' "$server_port" >&2
  exit 2
}

export READMATES_LOCAL_PROMETHEUS_PORT="${READMATES_LOCAL_PROMETHEUS_PORT:-$(free_port)}"
export READMATES_LOCAL_GRAFANA_PORT="${READMATES_LOCAL_GRAFANA_PORT:-$(free_port)}"
export READMATES_LOCAL_TEMPO_PORT="${READMATES_LOCAL_TEMPO_PORT:-$(free_port)}"
export READMATES_LOCAL_OTLP_HTTP_PORT="${READMATES_LOCAL_OTLP_HTTP_PORT:-$(free_port)}"
mysql_port="$(free_port)"
app_port="$(free_port)"

prometheus_url="http://127.0.0.1:${READMATES_LOCAL_PROMETHEUS_PORT}"
grafana_url="http://127.0.0.1:${READMATES_LOCAL_GRAFANA_PORT}"
tempo_url="http://127.0.0.1:${READMATES_LOCAL_TEMPO_PORT}"
otlp_url="http://127.0.0.1:${READMATES_LOCAL_OTLP_HTTP_PORT}/v1/traces"
server_health_url="http://127.0.0.1:${server_port}/actuator/health"
server_metrics_url="http://127.0.0.1:${server_port}/actuator/prometheus"

docker run -d --rm --name "$mysql_container" \
  -e MYSQL_ROOT_PASSWORD=smoke-root \
  -e MYSQL_DATABASE=readmates \
  -e MYSQL_USER=readmates \
  -e MYSQL_PASSWORD=readmates \
  -p "127.0.0.1:${mysql_port}:3306" \
  mysql:8.4 >/dev/null

for i in $(seq 1 60); do
  if docker exec "$mysql_container" mysqladmin ping -h 127.0.0.1 -ureadmates -preadmates --silent >/dev/null 2>&1; then
    printf 'OK: isolated MySQL ready\n'
    break
  fi
  if [[ "$i" == 60 ]]; then
    docker logs "$mysql_container" >&2
    exit 1
  fi
  sleep 1
done

docker compose -p "$project" -f "$compose_file" up -d tempo
wait_http "Tempo ready" "$tempo_url/ready"

env \
  SERVER_PORT="$app_port" \
  READMATES_MANAGEMENT_PORT="$server_port" \
  SPRING_DATASOURCE_URL="jdbc:mysql://127.0.0.1:${mysql_port}/readmates?serverTimezone=UTC" \
  SPRING_DATASOURCE_USERNAME=readmates \
  SPRING_DATASOURCE_PASSWORD=readmates \
  READMATES_BFF_SECRET_REQUIRED=false \
  READMATES_IP_HASH_BASE_SECRET=local-observability-smoke \
  READMATES_AUTH_RETURN_STATE_SECRET=local-observability-smoke \
  READMATES_AIGEN_ENABLED=false \
  READMATES_OTLP_TRACES_ENDPOINT="$otlp_url" \
  ./server/gradlew -p server bootRun >"$tmpdir/server.log" 2>&1 &
server_pid=$!

if ! wait_http "ReadMates server health" "$server_health_url" 90; then
  tail -n 160 "$tmpdir/server.log" >&2
  exit 1
fi

docker compose -p "$project" -f "$compose_file" up -d prometheus grafana
wait_http "Prometheus ready" "$prometheus_url/-/ready"
wait_http "Grafana ready" "$grafana_url/api/health"

trace_id="0123456789abcdef0123456789abcdef"
span_id="0123456789abcdef"
start_nanos="$(($(date +%s) * 1000000000))"
end_nanos="$((start_nanos + 1000000))"
payload="$(printf '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"readmates-observability-smoke"}}]},"scopeSpans":[{"scope":{"name":"readmates.observability.smoke"},"spans":[{"traceId":"%s","spanId":"%s","name":"readmates.observability.synthetic","kind":1,"startTimeUnixNano":"%s","endTimeUnixNano":"%s","attributes":[{"key":"readmates.synthetic","value":{"boolValue":true}}],"status":{"code":1}}]}]}]}' "$trace_id" "$span_id" "$start_nanos" "$end_nanos")"

curl -fsS -H 'Content-Type: application/json' --data-binary "$payload" "$otlp_url" >/dev/null
for i in $(seq 1 60); do
  if curl -fsS "$tempo_url/api/traces/$trace_id" | jq -e '
      . as $trace
      | ([$trace.batches[].resource.attributes[] | select(.key == "service.name") | .value.stringValue]
          | contains(["readmates-observability-smoke"]))
        and
        ([$trace.batches[].scopeSpans[].spans[].name]
          | contains(["readmates.observability.synthetic"]))
    ' >/dev/null 2>&1; then
    printf 'OK: deterministic synthetic trace query\n'
    break
  fi
  if [[ "$i" == 60 ]]; then
    printf 'FAILED: Tempo did not return synthetic trace %s\n' "$trace_id" >&2
    exit 1
  fi
  sleep 1
done

wait_json_count "Grafana Prometheus datasource(s):" "$grafana_url/api/datasources/uid/prometheus" 'if .uid == "prometheus" then 1 else 0 end' 1
wait_json_count "Grafana Tempo datasource(s):" "$grafana_url/api/datasources/uid/readmates-tempo" 'if .uid == "readmates-tempo" then 1 else 0 end' 1
wait_json_count "Grafana AI dashboard(s):" "$grafana_url/api/dashboards/uid/aigen-overview" 'if .dashboard.uid == "aigen-overview" then 1 else 0 end' 1
wait_json_count "Prometheus Tempo target(s):" "$prometheus_url/api/v1/targets" '[.data.activeTargets[] | select(.labels.job == "tempo" and .health == "up")] | length' 1
wait_json_count "Prometheus ReadMates server target(s):" "$prometheus_url/api/v1/targets" '[.data.activeTargets[] | select(.labels.job == "readmates-server" and .health == "up")] | length' 1

curl -fsS "http://127.0.0.1:${app_port}/observability-smoke-not-found" >/dev/null 2>&1 || true
wait_json_count "OTLP exported span metric(s):" "$prometheus_url/api/v1/query?query=readmates_observability_otlp_export_spans_total%7Bstatus%3D%22exported%22%7D" '.data.result | length' 1 30

docker compose -p "$project" -f "$compose_file" stop tempo >/dev/null
curl -fsS "http://127.0.0.1:${app_port}/observability-smoke-tempo-down" >/dev/null 2>&1 || true
wait_http "ReadMates server survives Tempo failure" "$server_health_url" 10

failed_spans=0
for i in $(seq 1 30); do
  failed_spans="$(curl -fsS "$server_metrics_url" | awk '/readmates_observability_otlp_export_spans_total\{[^}]*status="failed"/ {print $NF; exit}')"
  failed_spans="${failed_spans:-0}"
  if awk -v value="$failed_spans" 'BEGIN { exit !(value > 0 && value <= 64) }'; then
    printf 'OK: bounded OTLP failure metric %s span(s)\n' "$failed_spans"
    break
  fi
  if [[ "$i" == 30 ]]; then
    tail -n 160 "$tmpdir/server.log" >&2
    printf 'FAILED: expected bounded failed OTLP span count in (0,64], got %s\n' "$failed_spans" >&2
    exit 1
  fi
  sleep 1
done

grep -Fq 'max-queue-size: 2048' server/src/main/resources/application.yml
grep -Fq 'max-batch-size: 512' server/src/main/resources/application.yml
if grep -Fq 'Failed to publish metrics to OTLP' "$tmpdir/server.log"; then
  printf 'FAILED: the server attempted to export metrics to Tempo\n' >&2
  exit 1
fi
printf 'observability-local-smoke: PASS\n'
