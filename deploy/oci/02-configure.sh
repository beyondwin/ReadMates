#!/usr/bin/env bash
# 02-configure.sh — VM 인프라 셋업 (디렉토리, Caddy).
# 시크릿/환경변수는 GitHub Actions 의 sync-config 워크플로가 관리.
#
# 실행:
#   ssh -i ~/.ssh/<admin-key> ubuntu@<vm-host> 'bash -s' < deploy/oci/02-configure.sh
#
# 필요 환경변수:
#   CADDY_SITE  (예: api.example.com)

set -euo pipefail

: "${CADDY_SITE:?CADDY_SITE 환경변수가 필요합니다 (예: CADDY_SITE=api.example.com)}"

case "$CADDY_SITE" in
  :*|http://*|http:*)
    echo "❌ CADDY_SITE는 운영 HTTPS 사이트 주소여야 합니다. 현재 값: ${CADDY_SITE}" >&2
    echo "   예: CADDY_SITE=api.example.com 또는 CADDY_SITE=https://api.example.com" >&2
    exit 1
    ;;
esac

echo "==> [1/3] /etc/readmates 디렉토리 (deploy 유저 소유, 750)"
sudo mkdir -p /etc/readmates
if id -u deploy >/dev/null 2>&1; then
  sudo chown deploy:deploy /etc/readmates
  sudo chmod 750 /etc/readmates
  if [ ! -f /etc/readmates/readmates.env ]; then
    echo "   ⚠️  /etc/readmates/readmates.env 가 아직 없습니다."
    echo "      → GitHub Actions 의 'sync-config' 워크플로를 먼저 실행하세요."
    echo "      → vm-deploy-key-bootstrap.md runbook 참고."
  fi
else
  echo "   ⚠️  deploy 유저가 아직 없습니다 — vm-deploy-key-bootstrap.md 부터 진행하세요."
  sudo chmod 750 /etc/readmates
fi

echo "==> [2/3] /opt/readmates 디렉토리"
sudo mkdir -p /opt/readmates
if id -u deploy >/dev/null 2>&1; then
  sudo chown deploy:deploy /opt/readmates
fi

echo "==> [3/3] Caddy 설정 (${CADDY_SITE} → readmates-api:8080)"
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${CADDY_SITE} {
    reverse_proxy 127.0.0.1:8080
    log {
        output file /var/log/caddy/readmates.log
        format filter {
            wrap console
            request>uri delete
            request>headers>Authorization delete
            request>headers>Cookie delete
            request>headers>X-Readmates-Bff-Secret delete
        }
    }
}
EOF
sudo mkdir -p /var/log/caddy
sudo systemctl restart caddy
echo "   ✅ Caddy 설정 완료"

echo ""
echo "✅ 인프라 셋업 완료."
echo "   다음: GitHub Actions 의 'sync-config' 워크플로 실행 → 05-deploy-compose-stack.sh"
