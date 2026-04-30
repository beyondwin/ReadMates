# OCI Compose Stack

ReadMates의 최종 OCI backend runtime은 Caddy, Spring Boot API, Redis, Redpanda를 Docker Compose stack으로 실행합니다. Public ingress는 Caddy 80/443뿐이고 Spring Boot, Redis, Redpanda는 compose internal network에 둡니다.

## Files

- `deploy/oci/04-install-docker.sh`: VM Docker bootstrap
- `deploy/oci/05-deploy-compose-stack.sh`: local compose deployment
- `deploy/oci/compose.yml`: runtime stack
- `deploy/oci/Caddyfile`: Caddy reverse proxy
- `deploy/oci/readmates-stack.service`: systemd wrapper

## First Setup

Compose stack은 deploy/config/start 전에 VM의 `/etc/readmates/readmates.env`가 먼저 있어야 합니다. 이 파일에는 Spring `prod` runtime 값이 들어가며 Git에는 실제 값을 기록하지 않습니다.

준비 방법은 둘 중 하나입니다.

1. Legacy host 설정 flow로 `/etc/readmates/readmates.env`를 먼저 만듭니다. `deploy/oci/02-configure.sh`는 placeholder-safe 변수 이름만 문서화하고 실제 운영 값은 실행 시 Git 밖에서 주입합니다.
2. 운영자가 VM에서 `/etc/readmates/readmates.env`를 직접 만듭니다. 문서에는 `<db-password>`, `<google-oauth-client-id>` 같은 placeholder만 남기고 실제 DB/OAuth/BFF/SMTP 값은 VM 또는 운영 secret 채널에만 둡니다.

`05-deploy-compose-stack.sh`는 `/etc/readmates/caddy.env`와 `/opt/readmates/.env`를 생성하지만 `/etc/readmates/readmates.env`는 생성하지 않습니다.

Docker와 Compose plugin은 VM에서 한 번 설치합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
```

## Preflight Stop Rules

아래 조건이 맞지 않으면 `05-deploy-compose-stack.sh`를 실행하지 않습니다.

- VM의 `/etc/readmates/readmates.env`가 있고 권한이 `600`입니다.
- Docker와 Compose plugin이 VM에서 동작합니다.
- DB backup이 Git 밖의 운영 backup 위치에 있고 최근 48시간 이내 파일입니다. 배포 script는 `/var/backups/readmates/mysql/*.sql.gz`의 최근 파일을 확인합니다.
- legacy host `readmates-server`와 host `caddy`를 중지/disable해도 되는 cutover window와 권한이 있습니다.

`05-deploy-compose-stack.sh`는 compose stack 시작 전에 legacy host 서비스를 중지하고 disable합니다. 이 권한이나 rollback 기준이 없으면 먼저 [Rollback](#rollback) 경로를 준비합니다.

## Deploy

`05-deploy-compose-stack.sh`는 서버 이미지를 만들고 VM으로 전송한 뒤 `/opt/readmates/.env`에 `READMATES_SERVER_IMAGE`를 저장합니다. 재부팅 뒤에도 systemd compose stack이 같은 image tag로 올라오게 하기 위한 파일입니다.

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
```

완료 기준은 script가 끝까지 성공하고, compose `readmates-api` health, Cloudflare BFF auth smoke, production integration smoke가 모두 통과하는 것입니다. Redis/Kafka 기능 flag는 별도 rollout 전에는 켜지지 않은 상태로 둡니다.

## Smoke

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health'
curl -fsS https://readmates.pages.dev/api/bff/api/auth/me
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev ./scripts/smoke-production-integrations.sh
```

## Rollback

서버 image만 되돌릴 때는 `/opt/readmates/.env`의 `READMATES_SERVER_IMAGE`를 이전 tag로 바꾸고 `readmates-api`를 다시 올립니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" readmates-server:previous | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
```

Compose cutover 자체가 실패하면 compose stack을 멈춘 뒤 legacy host JAR와 host Caddy로 되돌립니다. 이 경로는 전환과 장애 대응용입니다.

VM에서 compose stack을 먼저 중지합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'sudo systemctl stop readmates-stack || true && sudo systemctl disable readmates-stack || true'
```

마지막으로 검증된 JAR가 VM에 있는지 확인합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'sudo test -s /opt/readmates/readmates-server.jar && sudo ls -lh /opt/readmates/readmates-server.jar'
```

검증된 JAR가 없거나 교체가 필요하면 로컬에서 다시 배포합니다.

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

Legacy host 서비스를 Spring, Caddy 순서로 올립니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'sudo systemctl enable --now readmates-server && sudo systemctl enable --now caddy && sudo systemctl status readmates-server --no-pager && sudo systemctl status caddy --no-pager'
```

## Redis and Kafka Flags

Compose stack에서는 Redis와 Redpanda endpoint가 각각 `redis://redis:6379`, `redpanda:9092`입니다. Redis 기능은 먼저 켜고 안정화 뒤 알림/Kafka를 별도로 켭니다.

Redis rollout order:

```bash
READMATES_REDIS_ENABLED=true
READMATES_RATE_LIMIT_ENABLED=true
READMATES_AUTH_SESSION_CACHE_ENABLED=true
READMATES_PUBLIC_CACHE_ENABLED=true
READMATES_NOTES_CACHE_ENABLED=true
```

Kafka rollout order:

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_KAFKA_ENABLED=true
```
