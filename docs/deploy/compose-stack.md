# OCI Compose Stack

ReadMates의 최종 OCI backend runtime은 Caddy, Spring Boot API, Redis, Redpanda를 Docker Compose stack으로 실행합니다. Public ingress는 Caddy 80/443뿐이고 Spring Boot, Redis, Redpanda는 compose internal network에 둡니다.

## Files

- `deploy/oci/04-install-docker.sh`: VM Docker bootstrap
- `deploy/oci/05-deploy-compose-stack.sh`: local compose deployment
- `deploy/oci/compose.yml`: runtime stack
- `deploy/oci/Caddyfile`: Caddy reverse proxy
- `deploy/oci/readmates-stack.service`: systemd wrapper

## First Setup

기존 `/etc/readmates/readmates.env` 운영 변수는 그대로 사용합니다. Docker와 Compose plugin은 VM에서 한 번 설치합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
```

## Deploy

`05-deploy-compose-stack.sh`는 서버 이미지를 만들고 VM으로 전송한 뒤 `/opt/readmates/.env`에 `READMATES_SERVER_IMAGE`를 저장합니다. 재부팅 뒤에도 systemd compose stack이 같은 image tag로 올라오게 하기 위한 파일입니다.

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP=VM_PUBLIC_IP CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
```

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

Compose cutover 자체가 실패하면 `readmates-stack`을 멈추고 legacy host `readmates-server`/`caddy` 서비스를 다시 enable한 뒤 마지막으로 검증된 JAR 배포 상태로 되돌립니다. 이 경로는 전환과 장애 대응용입니다.

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
