#!/usr/bin/env bash
# 01-vm-setup.sh — VM 최초 세팅 (Java 21 + Caddy + 유저 생성)
# 실행: ssh -i ~/.ssh/readmates_oci ubuntu@<VM_PUBLIC_IP> 'bash -s' < deploy/oci/01-vm-setup.sh
set -euo pipefail

echo "==> [1/4] 시스템 업데이트"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> [2/4] Java 21 설치"
sudo apt-get install -y openjdk-21-jre-headless
java -version

echo "==> [3/4] Caddy 설치"
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update -y
sudo apt-get install -y caddy

echo "==> [4/4] readmates 유저 및 디렉터리 생성"
sudo useradd -r -s /bin/false -d /opt/readmates readmates 2>/dev/null || echo "(유저 이미 존재)"
sudo mkdir -p /opt/readmates
sudo mkdir -p /etc/readmates
sudo chown -R readmates:readmates /opt/readmates

echo ""
echo "✅ VM 세팅 완료. 다음: 02-configure.sh 실행"
