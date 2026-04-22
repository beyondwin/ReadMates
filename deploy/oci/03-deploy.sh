#!/usr/bin/env bash
# 03-deploy.sh — JAR 배포 및 서비스 재시작 (로컬에서 실행)
# 사용법: VM_PUBLIC_IP=<IP> ./deploy/oci/03-deploy.sh
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요 (예: VM_PUBLIC_IP=1.2.3.4 ./03-deploy.sh)}"

SSH_KEY="${SSH_KEY:-~/.ssh/readmates_oci}"
JAR_PATH="server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar"
REMOTE_USER="ubuntu"
REMOTE_JAR="/opt/readmates/readmates-server.jar"
APP_BASE_URL="${READMATES_APP_BASE_URL:-https://readmates.pages.dev}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

if [ ! -f "$JAR_PATH" ]; then
  echo "❌ JAR 파일 없음: $JAR_PATH"
  echo "   먼저 빌드하세요: cd server && ./gradlew bootJar"
  exit 1
fi

echo "==> [1/3] JAR 전송 ($(du -sh "$JAR_PATH" | cut -f1))"
scp "${SSH_OPTIONS[@]}" \
  "$JAR_PATH" \
  "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-server.jar"

echo "==> [2/3] JAR 배치 및 권한 설정"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo mv /tmp/readmates-server.jar ${REMOTE_JAR} && sudo chown readmates:readmates ${REMOTE_JAR}"

echo "==> [3/3] 서비스 재시작"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "sudo systemctl restart readmates-server && sleep 3 && sudo systemctl status readmates-server --no-pager"

echo ""
echo "✅ 배포 완료!"
echo "   VM 헬스체크: ssh -i $SSH_KEY ${REMOTE_USER}@${VM_PUBLIC_IP} 'curl -sS http://127.0.0.1:8080/internal/health'"
echo "   운영 BFF 확인: curl -sS ${APP_BASE_URL}/api/bff/api/auth/me"
echo "   로그: ssh -i $SSH_KEY ${REMOTE_USER}@${VM_PUBLIC_IP} 'sudo journalctl -u readmates-server -f'"
