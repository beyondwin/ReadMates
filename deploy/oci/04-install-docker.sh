#!/usr/bin/env bash
# 04-install-docker.sh — Docker Engine + Compose plugin 설치
# 실행: ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
set -euo pipefail

echo "==> [1/5] Docker prerequisites 설치"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

echo "==> [2/5] Docker apt repository 등록"
sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

echo "==> [3/5] Docker Engine 설치"
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> [4/5] readmates 운영 디렉터리 준비"
sudo useradd -r -s /usr/sbin/nologin -d /opt/readmates readmates 2>/dev/null || true
sudo mkdir -p /opt/readmates /etc/readmates
sudo chown -R readmates:readmates /opt/readmates
sudo chmod 755 /opt/readmates

echo "==> [5/5] Docker 동작 확인"
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version

echo ""
echo "Docker 설치 완료. 다음: 로컬에서 deploy/oci/05-deploy-compose-stack.sh 실행"
