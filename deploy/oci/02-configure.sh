#!/usr/bin/env bash
# 02-configure.sh — 환경변수, systemd, Caddy 설정
# 실행: ssh -i ~/.ssh/readmates_oci ubuntu@<VM_PUBLIC_IP> 'bash -s' < deploy/oci/02-configure.sh
# 주의: 아래 변수들은 실행 전 환경변수로 주입하거나 직접 수정
set -euo pipefail

: "${SPRING_PROFILES_ACTIVE:=prod}"
: "${SPRING_DATASOURCE_USERNAME:=readmates}"
if [ -z "${SPRING_DATASOURCE_URL:-}" ]; then
  : "${MYSQL_PRIVATE_IP:?MYSQL_PRIVATE_IP 또는 SPRING_DATASOURCE_URL 환경변수가 필요합니다}"
  SPRING_DATASOURCE_URL="jdbc:mysql://${MYSQL_PRIVATE_IP}:3306/readmates?useSSL=true&serverTimezone=UTC"
fi
: "${APP_DB_PASS:?APP_DB_PASS 환경변수가 필요합니다}"
: "${BFF_SECRET:?BFF_SECRET 환경변수가 필요합니다}"
: "${READMATES_AUTH_RETURN_STATE_SECRET:?READMATES_AUTH_RETURN_STATE_SECRET 환경변수가 필요합니다}"
: "${READMATES_APP_BASE_URL:=https://readmates.pages.dev}"
: "${READMATES_AUTH_BASE_URL:=${READMATES_APP_BASE_URL}}"
: "${READMATES_ALLOWED_ORIGINS:=${READMATES_APP_BASE_URL}}"
: "${READMATES_AUTH_SESSION_COOKIE_SECURE:=true}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID 환경변수가 필요합니다}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET 환경변수가 필요합니다}"
: "${GOOGLE_SCOPE:=openid,email,profile}"
: "${CADDY_SITE:?CADDY_SITE 환경변수가 필요합니다 (예: CADDY_SITE=api.example.com 또는 CADDY_SITE=https://api.example.com)}"

case "$CADDY_SITE" in
  :*|http://*|http:*)
    echo "❌ CADDY_SITE는 운영 HTTPS 사이트 주소여야 합니다. 현재 값: ${CADDY_SITE}" >&2
    echo "   예: CADDY_SITE=api.example.com 또는 CADDY_SITE=https://api.example.com" >&2
    exit 1
    ;;
esac

echo "==> [1/3] readmates.env 생성"
sudo mkdir -p /etc/readmates
sudo tee /etc/readmates/readmates.env > /dev/null <<EOF
SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE}
SPRING_DATASOURCE_URL=${SPRING_DATASOURCE_URL}
SPRING_DATASOURCE_USERNAME=${SPRING_DATASOURCE_USERNAME}
SPRING_DATASOURCE_PASSWORD=${APP_DB_PASS}
READMATES_APP_BASE_URL=${READMATES_APP_BASE_URL}
READMATES_AUTH_BASE_URL=${READMATES_AUTH_BASE_URL}
READMATES_AUTH_RETURN_STATE_SECRET=${READMATES_AUTH_RETURN_STATE_SECRET}
READMATES_ALLOWED_ORIGINS=${READMATES_ALLOWED_ORIGINS}
READMATES_BFF_SECRET=${BFF_SECRET}
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=${READMATES_AUTH_SESSION_COOKIE_SECURE}
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=${GOOGLE_SCOPE}
EOF
sudo chmod 600 /etc/readmates/readmates.env
echo "   ✅ /etc/readmates/readmates.env 생성됨"

echo "==> [2/3] systemd 서비스 등록"
sudo tee /etc/systemd/system/readmates-server.service > /dev/null <<'EOF'
[Unit]
Description=ReadMates Spring Boot API
After=network-online.target
Wants=network-online.target

[Service]
User=readmates
WorkingDirectory=/opt/readmates
EnvironmentFile=/etc/readmates/readmates.env
ExecStart=/usr/bin/java -jar /opt/readmates/readmates-server.jar
Restart=always
RestartSec=5
SuccessExitStatus=143
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/readmates
CapabilityBoundingSet=
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable readmates-server
echo "   ✅ systemd 서비스 등록됨"

echo "==> [3/3] Caddy 설정 (${CADDY_SITE} → localhost:8080)"
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
echo "   ✅ Caddy 설정 완료 (${CADDY_SITE} → 8080)"

echo ""
echo "✅ 설정 완료. 다음: 03-deploy.sh 실행 (로컬에서)"
