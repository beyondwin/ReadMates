#!/usr/bin/env bash
# 06-deploy-observability-stack.sh — Prometheus/Alertmanager/Grafana stack 배포
# 사용법:
#   VM_PUBLIC_IP=1.2.3.4 ./deploy/oci/06-deploy-observability-stack.sh
#   READMATES_OBSERVABILITY_SERVICES=prometheus VM_PUBLIC_IP=1.2.3.4 ./deploy/oci/06-deploy-observability-stack.sh
# shellcheck disable=SC2029,SC2087
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
COMPOSE_PROJECT="${READMATES_COMPOSE_PROJECT:-readmates}"
SERVICES="${READMATES_OBSERVABILITY_SERVICES:-prometheus alertmanager grafana}"
SKIP_VALIDATE="${READMATES_SKIP_OBSERVABILITY_VALIDATE:-false}"
GRAFANA_ADMIN_USER="${READMATES_GRAFANA_ADMIN_USER:-readmates}"

COMPOSE_INFRA_FILE="deploy/oci/compose.infra.yml"
PROMETHEUS_FILE="deploy/oci/prometheus/prometheus.yml"
ALERTMANAGER_FILE="deploy/oci/alertmanager/alertmanager.yml"
ALERT_RULES_DIR="ops/prometheus/alerts"
GRAFANA_PROVISIONING_DIR="deploy/oci/grafana/provisioning"
GRAFANA_DASHBOARDS_DIR="ops/grafana/dashboards"

SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "필수 파일 없음: $path" >&2
    return 1
  fi
}

require_dir() {
  local path="$1"
  if [ ! -d "$path" ]; then
    echo "필수 디렉터리 없음: $path" >&2
    return 1
  fi
}

shell_quote() {
  printf "%q" "$1"
}

service_enabled() {
  local service="$1"
  [[ " $SERVICES " == *" $service "* ]]
}

require_alert_env() {
  local missing=()
  local key
  for key in \
    READMATES_ALERT_SMTP_HOST \
    READMATES_ALERT_SMTP_PORT \
    READMATES_ALERT_SMTP_USER \
    READMATES_ALERT_SMTP_PASSWORD \
    READMATES_ALERT_SMTP_FROM \
    READMATES_ALERT_EMAIL_TO; do
    if [ -z "${!key:-}" ]; then
      missing+=("$key")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    printf 'Alertmanager 배포에는 다음 환경변수가 필요합니다: %s\n' "${missing[*]}" >&2
    printf 'Prometheus만 먼저 띄우려면 READMATES_OBSERVABILITY_SERVICES=prometheus 로 실행하세요.\n' >&2
    return 1
  fi
}

require_grafana_env() {
  if [ -z "${READMATES_GRAFANA_ADMIN_PASSWORD:-}" ]; then
    printf 'Grafana 배포에는 READMATES_GRAFANA_ADMIN_PASSWORD 환경변수가 필요합니다.\n' >&2
    printf 'Prometheus만 먼저 띄우려면 READMATES_OBSERVABILITY_SERVICES=prometheus 로 실행하세요.\n' >&2
    return 1
  fi
}

write_alert_env() {
  local target="$1"
  umask 077
  {
    printf 'READMATES_ALERT_SMTP_HOST=%s\n' "$READMATES_ALERT_SMTP_HOST"
    printf 'READMATES_ALERT_SMTP_PORT=%s\n' "$READMATES_ALERT_SMTP_PORT"
    printf 'READMATES_ALERT_SMTP_USER=%s\n' "$READMATES_ALERT_SMTP_USER"
    printf 'READMATES_ALERT_SMTP_PASSWORD=%s\n' "$READMATES_ALERT_SMTP_PASSWORD"
    printf 'READMATES_ALERT_SMTP_FROM=%s\n' "$READMATES_ALERT_SMTP_FROM"
    printf 'READMATES_ALERT_EMAIL_TO=%s\n' "$READMATES_ALERT_EMAIL_TO"
  } > "$target"
}

write_alert_dummy_env() {
  local target="$1"
  umask 077
  {
    printf 'READMATES_ALERT_SMTP_HOST=smtp.example.com\n'
    printf 'READMATES_ALERT_SMTP_PORT=587\n'
    printf 'READMATES_ALERT_SMTP_USER=example-user\n'
    printf 'READMATES_ALERT_SMTP_PASSWORD=example-password\n'
    printf 'READMATES_ALERT_SMTP_FROM=alerts@example.com\n'
    printf 'READMATES_ALERT_EMAIL_TO=ops@example.com\n'
  } > "$target"
}

write_grafana_env() {
  local target="$1"
  local password="$2"
  umask 077
  {
    printf 'GF_SECURITY_ADMIN_USER=%s\n' "$GRAFANA_ADMIN_USER"
    printf 'GF_SECURITY_ADMIN_PASSWORD=%s\n' "$password"
    printf 'GF_AUTH_ANONYMOUS_ENABLED=false\n'
    printf 'GF_USERS_ALLOW_SIGN_UP=false\n'
    printf 'GF_ANALYTICS_REPORTING_ENABLED=false\n'
    printf 'GF_ANALYTICS_CHECK_FOR_UPDATES=false\n'
  } > "$target"
}

write_grafana_dummy_env() {
  local target="$1"
  umask 077
  {
    printf 'GF_SECURITY_ADMIN_USER=readmates\n'
    printf 'GF_SECURITY_ADMIN_PASSWORD=example-long-random-password\n'
    printf 'GF_AUTH_ANONYMOUS_ENABLED=false\n'
    printf 'GF_USERS_ALLOW_SIGN_UP=false\n'
    printf 'GF_ANALYTICS_REPORTING_ENABLED=false\n'
    printf 'GF_ANALYTICS_CHECK_FOR_UPDATES=false\n'
  } > "$target"
}

create_clean_archive() {
  local source_dir="$1"
  local target="$2"
  COPYFILE_DISABLE=1 tar \
    --exclude='._*' \
    --exclude='.DS_Store' \
    -C "$source_dir" \
    -czf "$target" .
}

echo "==> [1/7] 필수 파일 확인"
require_file "$COMPOSE_INFRA_FILE"
require_file "$PROMETHEUS_FILE"
require_file "$ALERTMANAGER_FILE"
require_dir "$ALERT_RULES_DIR"

if service_enabled alertmanager; then
  require_alert_env
fi
if service_enabled grafana; then
  require_grafana_env
  require_dir "$GRAFANA_PROVISIONING_DIR"
  require_dir "$GRAFANA_DASHBOARDS_DIR"
fi

if [ "$SKIP_VALIDATE" != "true" ]; then
  echo "==> [2/7] 관측 설정 로컬 검증"
  ./scripts/validate-prometheus-rules.sh
  ./scripts/validate-prometheus-config.sh
  if service_enabled alertmanager; then
    ./scripts/validate-alertmanager-config.sh
  fi
  if service_enabled grafana; then
    ./scripts/lint-grafana-dashboards.sh "$GRAFANA_DASHBOARDS_DIR"
  fi
else
  echo "==> [2/7] 관측 설정 로컬 검증 건너뜀"
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/readmates-observability.XXXXXX")"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

if service_enabled alertmanager; then
  write_alert_env "$tmpdir/alertmanager.env"
else
  write_alert_dummy_env "$tmpdir/alertmanager.env"
fi
if service_enabled grafana; then
  write_grafana_env "$tmpdir/grafana.env" "$READMATES_GRAFANA_ADMIN_PASSWORD"
else
  write_grafana_dummy_env "$tmpdir/grafana.env"
fi

echo "==> [3/7] VM Docker/Compose 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo docker version >/dev/null && sudo docker compose version >/dev/null"

echo "==> [4/7] 관측성 파일 전송"
scp "${SSH_OPTIONS[@]}" "$COMPOSE_INFRA_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-compose.infra.yml"
scp "${SSH_OPTIONS[@]}" "$PROMETHEUS_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-prometheus.yml"
scp "${SSH_OPTIONS[@]}" "$ALERTMANAGER_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-alertmanager.yml"
create_clean_archive "$ALERT_RULES_DIR" "$tmpdir/prometheus-alerts.tgz"
scp "${SSH_OPTIONS[@]}" "$tmpdir/prometheus-alerts.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-prometheus-alerts.tgz"
scp "${SSH_OPTIONS[@]}" "$tmpdir/alertmanager.env" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-alertmanager.env"
scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana.env" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana.env"
if service_enabled grafana; then
  create_clean_archive "$GRAFANA_PROVISIONING_DIR" "$tmpdir/grafana-provisioning.tgz"
  create_clean_archive "$GRAFANA_DASHBOARDS_DIR" "$tmpdir/grafana-dashboards.tgz"
  scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana-provisioning.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana-provisioning.tgz"
  scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana-dashboards.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana-dashboards.tgz"
fi

echo "==> [5/7] VM 관측성 파일 설치"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR") $(shell_quote "$COMPOSE_PROJECT") $(shell_quote "$SERVICES")" <<'EOF'
set -euo pipefail
remote_dir="$1"
compose_project="$2"
services="$3"

sudo install -d -m 0755 "$remote_dir/deploy/oci/prometheus" "$remote_dir/deploy/oci/alertmanager" "$remote_dir/deploy/oci/grafana/provisioning" "$remote_dir/ops/prometheus/alerts" "$remote_dir/ops/grafana/dashboards"
sudo mv /tmp/readmates-compose.infra.yml "$remote_dir/deploy/oci/compose.infra.yml"
sudo mv /tmp/readmates-prometheus.yml "$remote_dir/deploy/oci/prometheus/prometheus.yml"
sudo mv /tmp/readmates-alertmanager.yml "$remote_dir/deploy/oci/alertmanager/alertmanager.yml"
sudo tar -xzf /tmp/readmates-prometheus-alerts.tgz -C "$remote_dir/ops/prometheus/alerts"
sudo rm -f /tmp/readmates-prometheus-alerts.tgz

sudo mv /tmp/readmates-alertmanager.env "$remote_dir/deploy/oci/alertmanager.env"
sudo chmod 600 "$remote_dir/deploy/oci/alertmanager.env"
sudo mv /tmp/readmates-grafana.env "$remote_dir/deploy/oci/grafana.env"
sudo chmod 600 "$remote_dir/deploy/oci/grafana.env"

if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])grafana([[:space:]]|$)'; then
  sudo tar -xzf /tmp/readmates-grafana-provisioning.tgz -C "$remote_dir/deploy/oci/grafana/provisioning"
  sudo tar -xzf /tmp/readmates-grafana-dashboards.tgz -C "$remote_dir/ops/grafana/dashboards"
  sudo rm -f /tmp/readmates-grafana-provisioning.tgz /tmp/readmates-grafana-dashboards.tgz
fi

for cleanup_dir in "$remote_dir/ops/prometheus/alerts" "$remote_dir/deploy/oci/grafana/provisioning" "$remote_dir/ops/grafana/dashboards"; do
  if [ -d "$cleanup_dir" ]; then
    sudo find "$cleanup_dir" \( -name '._*' -o -name '.DS_Store' \) -delete
  fi
done

sudo chown -R readmates:readmates "$remote_dir/deploy/oci" "$remote_dir/ops/prometheus/alerts" "$remote_dir/ops/grafana/dashboards"
cd "$remote_dir/deploy/oci"
sudo docker compose -p "$compose_project" -f compose.infra.yml config >/dev/null
EOF

echo "==> [6/7] Prometheus/Alertmanager/Grafana 시작"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "cd $(shell_quote "$REMOTE_DIR/deploy/oci") && sudo docker compose -p $(shell_quote "$COMPOSE_PROJECT") -f compose.infra.yml up -d ${SERVICES}"

echo "==> [7/7] 관측성 smoke"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR") $(shell_quote "$COMPOSE_PROJECT") $(shell_quote "$SERVICES")" <<'EOF'
set -euo pipefail
remote_dir="$1"
compose_project="$2"
services="$3"
cd "$remote_dir/deploy/oci"

for i in $(seq 1 30); do
  if sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/-/ready >/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    sudo docker compose -p "$compose_project" -f compose.infra.yml logs --tail=120 prometheus
    exit 1
  fi
  sleep 2
done

rules_count="$(
  sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T prometheus \
    wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"' || true
)"
if [ "$rules_count" -lt 1 ]; then
  echo "Prometheus rule load 확인 실패: rules_count=$rules_count" >&2
  exit 1
fi

for i in $(seq 1 30); do
  targets="$(
    sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T prometheus \
      wget -qO- http://localhost:9090/api/v1/targets
  )"
  if printf '%s' "$targets" | grep -q '"job":"readmates-server"' && printf '%s' "$targets" | grep -q '"health":"up"'; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    printf '%s\n' "$targets" | head -c 4000 >&2
    echo >&2
    echo "readmates-server Prometheus target이 up 상태가 아닙니다." >&2
    exit 1
  fi
  sleep 2
done

if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])alertmanager([[:space:]]|$)'; then
  for i in $(seq 1 30); do
    if sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T alertmanager wget -qO- http://localhost:9093/-/ready >/dev/null; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      sudo docker compose -p "$compose_project" -f compose.infra.yml logs --tail=120 alertmanager
      exit 1
    fi
    sleep 2
  done
fi

if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])grafana([[:space:]]|$)'; then
  for i in $(seq 1 30); do
    if sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T grafana wget -qO- http://localhost:3000/api/health >/dev/null; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      sudo docker compose -p "$compose_project" -f compose.infra.yml logs --tail=120 grafana
      exit 1
    fi
    sleep 2
  done
fi

sudo docker compose -p "$compose_project" -f compose.infra.yml ps
EOF

echo ""
echo "관측성 stack 배포 완료"
echo "Prometheus target 확인:"
echo "  ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'cd ${REMOTE_DIR}/deploy/oci && sudo docker compose -p ${COMPOSE_PROJECT} -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets'"
if service_enabled grafana; then
  echo "Grafana 접속:"
  echo "  ssh -i ${SSH_KEY} -L 13001:127.0.0.1:3001 ${REMOTE_USER}@${VM_PUBLIC_IP}"
  echo "  http://localhost:13001"
fi
