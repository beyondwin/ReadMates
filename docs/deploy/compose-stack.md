# OCI Compose Stack

ReadMates의 최종 OCI backend runtime은 Caddy, Spring Boot API, Redis, Redpanda를 Docker Compose stack으로 실행합니다. Public ingress는 Caddy 80/443뿐이고 Spring Boot, Redis, Redpanda는 compose internal network에 둡니다.

## Files

- `deploy/oci/04-install-docker.sh`: VM Docker bootstrap
- `deploy/oci/05-deploy-compose-stack.sh`: compose deployment
- `deploy/oci/compose.yml`: runtime stack
- `deploy/oci/Caddyfile`: Caddy reverse proxy
- `deploy/oci/readmates-stack.service`: systemd wrapper

## First Setup

Compose stack은 deploy/config/start 전에 VM의 `/etc/readmates/readmates.env`가 먼저 있어야 합니다. 이 파일에는 Spring `prod` runtime 값이 들어가며 Git에는 실제 값을 기록하지 않습니다.

운영 표준 경로는 GitHub Actions의 `sync-config` 워크플로(`.github/workflows/sync-config.yml`)입니다. 워크플로는 GitHub Secrets/Variables 값을 렌더링해 `/etc/readmates/readmates.env`와 `/etc/readmates/caddy.env`를 scp로 배포합니다. 변수 inventory, 추가/회전 절차, 비상 복구는 [secrets management runbook](../operations/runbooks/secrets-management.md)을, 워크플로가 사용하는 deploy key/sudoers 부트스트랩은 [VM deploy key bootstrap](../operations/runbooks/vm-deploy-key-bootstrap.md)을 따릅니다. `deploy/oci/02-configure.sh`는 디렉터리와 Caddy만 설정하고 readmates.env를 더 이상 만들지 않습니다. App Compose는 OTLP를 public host가 아닌 같은 network의 `http://tempo:4318/v1/traces`로 고정합니다.

`05-deploy-compose-stack.sh`는 `/opt/readmates/.env`(compose image 변수)를 생성하지만 `/etc/readmates/readmates.env`와 `/etc/readmates/caddy.env`는 생성하지 않습니다.

Docker와 Compose plugin은 VM에서 한 번 설치합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
```

## Preflight Stop Rules

아래 조건이 맞지 않으면 `05-deploy-compose-stack.sh`를 실행하지 않습니다.

- VM의 `/etc/readmates/readmates.env`가 있고 권한이 `600`입니다.
- Docker와 Compose plugin이 VM에서 동작합니다.
- 릴리즈 배포에서 GHCR package가 private이면 VM에서 registry login이 Git 밖의 credential로 미리 완료되어 있습니다.
- DB backup이 Git 밖의 운영 backup 위치에 있고 최근 48시간 이내 파일입니다. 배포 script는 `/var/backups/readmates/mysql/*.sql.gz`의 최근 파일을 확인합니다.
- legacy host `readmates-server`와 host `caddy`를 중지/disable해도 되는 cutover window와 권한이 있습니다.

`05-deploy-compose-stack.sh`는 compose stack 시작 전에 legacy host 서비스를 중지하고 disable합니다. 이 권한이나 rollback 기준이 없으면 먼저 [Rollback](#rollback) 경로를 준비합니다.

## Deploy

`05-deploy-compose-stack.sh`는 `/opt/readmates/.env`에 `READMATES_SERVER_IMAGE`를 저장합니다. 릴리즈 배포에서는 `ghcr.io/<owner>/<repo>/readmates-server:vMAJOR.MINOR.PATCH` 이미지를 VM에서 pull하며, script를 실행하기 전에 `Deploy Server Image` workflow가 scan-candidate digest를 Trivy로 검사한 뒤 같은 digest를 release tag로 promote했는지 확인합니다. `READMATES_SERVER_IMAGE`가 `ghcr.io/`로 시작하지 않는 로컬 전환 검증에서는 script가 서버 이미지를 로컬에서 빌드해 VM으로 전송합니다.

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' VM_PUBLIC_IP='<vm-public-ip>' CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
```

완료 기준은 script가 끝까지 성공하고, `readmates-stack` systemd unit이 active 상태이며, compose `readmates-api` health, Cloudflare BFF auth smoke, production integration smoke가 모두 통과하는 것입니다. Redis/Kafka 기능 flag는 별도 rollout 전에는 켜지지 않은 상태로 둡니다.

앱 compose 배포는 `--remove-orphans`를 사용하지 않습니다. 같은 VM에서 관측 stack이 동일한 Compose project/network에 붙어 실행될 수 있으므로, 앱 배포가 Prometheus/Grafana/Alertmanager를 orphan으로 오인해 삭제하면 안 됩니다. 제거가 필요한 legacy 컨테이너는 운영자가 현재 `compose.yml`/`compose.infra.yml`과 `docker compose ps -a`를 대조한 뒤 명시적으로 정리합니다.

## Deploy Attempt Ledger

`05-deploy-compose-stack.sh`는 운영 VM의 `/var/log/readmates/deploy-attempts.jsonl`에 배포 attempt를 JSONL로 기록합니다. 이 ledger는 자동 rollback이나 재시도 트리거가 아니라, 실패 stage와 근거를 남겨 운영자가 rollback, 재시도, 조사를 판단하기 위한 기록입니다. 상태 모델과 stage별 대응은 [Deploy Attempts](../operations/runbooks/deploy-attempts.md)를 기준으로 합니다.

Ledger JSON field는 `attemptId`, `event`, `status`, `stage`, `at`, `durationSeconds`, 선택적 `detail`입니다. `detail`에는 `image=...`, `imageSource=...`, `imageId=...`, expected/running image id, `services=compose`, `path=...`, `watch=true/false`, `exitCode=...` 같은 짧은 문자열만 기록합니다. Image reference는 JSON escaping만 거치므로 외부 공유 전 image 이름과 `detail` 값이 public-safe인지 운영자가 확인해야 합니다. `/etc/readmates/readmates.env` 내용, DB host 실제 값, password, OAuth secret, BFF secret, SMTP credential, cookie, Authorization header, OAuth code, token, request/response body 전문, 운영 smoke 결과 전문, 실제 멤버/club 운영 데이터는 기록하지 않습니다.

## Smoke

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml exec -T readmates-api /app/bin/readmates-http-get 127.0.0.1 8080 /internal/health'
curl -fsS https://readmates.pages.dev/api/bff/api/auth/me
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev ./scripts/smoke-production-integrations.sh
```

## Post-deploy Watch

`05-deploy-compose-stack.sh`는 BFF auth smoke가 통과한 뒤 기본적으로 post-deploy watch helper를 실행합니다. Watch는 VM의 `readmates-stack`/compose health, Cloudflare BFF auth smoke, OAuth redirect smoke, 최근 backend log의 `ERROR`/exception 패턴을 묶어 확인합니다.

Watch 실패는 배포 실패로 기록하지만 자동 rollback은 수행하지 않습니다. 운영자는 ledger stage와 recent log를 보고 이전 image rollback 또는 runtime env 조사를 선택합니다. 상세 절차와 수동 실행 방법은 [Post-deploy Watch](../operations/runbooks/post-deploy-watch.md)를 기준으로 합니다.

## Rollback

서버 image만 되돌릴 때는 `/opt/readmates/.env`의 `READMATES_SERVER_IMAGE`를 이전 tag로 바꾸고 `readmates-api`를 다시 올립니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" "ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z-previous" | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
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
