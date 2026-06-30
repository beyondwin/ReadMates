#!/usr/bin/env bash
# 06-deploy-observability-stack.sh — Prometheus/Alertmanager stack 배포
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
SERVICES="${READMATES_OBSERVABILITY_SERVICES:-prometheus alertmanager}"
SKIP_VALIDATE="${READMATES_SKIP_OBSERVABILITY_VALIDATE:-false}"

COMPOSE_INFRA_FILE="deploy/oci/compose.infra.yml"
PROMETHEUS_FILE="deploy/oci/prometheus/prometheus.yml"
ALERTMANAGER_FILE="deploy/oci/alertmanager/alertmanager.yml"
ALERT_RULES_DIR="ops/prometheus/alerts"

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

echo "==> [1/7] 필수 파일 확인"
require_file "$COMPOSE_INFRA_FILE"
require_file "$PROMETHEUS_FILE"
require_file "$ALERTMANAGER_FILE"
require_dir "$ALERT_RULES_DIR"

if service_enabled alertmanager; then
  require_alert_env
fi

if [ "$SKIP_VALIDATE" != "true" ]; then
  echo "==> [2/7] 관측 설정 로컬 검증"
  ./scripts/validate-prometheus-rules.sh
  ./scripts/validate-prometheus-config.sh
  if service_enabled alertmanager; then
    ./scripts/validate-alertmanager-config.sh
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
fi

echo "==> [3/7] VM Docker/Compose 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo docker version >/dev/null && sudo docker compose version >/dev/null"

echo "==> [4/7] 관측성 파일 전송"
scp "${SSH_OPTIONS[@]}" "$COMPOSE_INFRA_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-compose.infra.yml"
scp "${SSH_OPTIONS[@]}" "$PROMETHEUS_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-prometheus.yml"
scp "${SSH_OPTIONS[@]}" "$ALERTMANAGER_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-alertmanager.yml"
tar -C "$ALERT_RULES_DIR" -czf "$tmpdir/prometheus-alerts.tgz" .
scp "${SSH_OPTIONS[@]}" "$tmpdir/prometheus-alerts.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-prometheus-alerts.tgz"
if service_enabled alertmanager; then
  scp "${SSH_OPTIONS[@]}" "$tmpdir/alertmanager.env" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-alertmanager.env"
fi

echo "==> [5/7] VM 관측성 파일 설치"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo bash -s -- $(shell_quote "$REMOTE_DIR") $(shell_quote "$COMPOSE_PROJECT") $(shell_quote "$SERVICES")" <<'EOF'
set -euo pipefail
remote_dir="$1"
compose_project="$2"
services="$3"

sudo install -d -m 0755 "$remote_dir/deploy/oci/prometheus" "$remote_dir/deploy/oci/alertmanager" "$remote_dir/ops/prometheus/alerts"
sudo mv /tmp/readmates-compose.infra.yml "$remote_dir/deploy/oci/compose.infra.yml"
sudo mv /tmp/readmates-prometheus.yml "$remote_dir/deploy/oci/prometheus/prometheus.yml"
sudo mv /tmp/readmates-alertmanager.yml "$remote_dir/deploy/oci/alertmanager/alertmanager.yml"
sudo tar -xzf /tmp/readmates-prometheus-alerts.tgz -C "$remote_dir/ops/prometheus/alerts"
sudo rm -f /tmp/readmates-prometheus-alerts.tgz

if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])alertmanager([[:space:]]|$)'; then
  sudo mv /tmp/readmates-alertmanager.env "$remote_dir/deploy/oci/alertmanager.env"
  sudo chmod 600 "$remote_dir/deploy/oci/alertmanager.env"
fi

sudo chown -R readmates:readmates "$remote_dir/deploy/oci" "$remote_dir/ops/prometheus/alerts"
cd "$remote_dir/deploy/oci"
sudo docker compose -p "$compose_project" -f compose.infra.yml config >/dev/null
EOF

echo "==> [6/7] Prometheus/Alertmanager 시작"
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

sudo docker compose -p "$compose_project" -f compose.infra.yml ps
EOF

echo ""
echo "관측성 stack 배포 완료"
echo "Prometheus target 확인:"
echo "  ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'cd ${REMOTE_DIR}/deploy/oci && sudo docker compose -p ${COMPOSE_PROJECT} -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets'"
