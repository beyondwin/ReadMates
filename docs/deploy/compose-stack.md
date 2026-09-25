# OCI Compose Stack

OCI backend는 Docker Compose stack으로 Caddy, Spring Boot API, Redis, Redpanda를 실행합니다. 외부에 열린 포트는 Caddy 80/443뿐입니다. Spring(8080/8081), Redis(6379), Redpanda(9092)는 compose 내부 network에만 있습니다.

전체 릴리즈 순서는 [release-publish-runbook.md](release-publish-runbook.md)를 따릅니다.

## Files

| 파일 | 역할 |
| --- | --- |
| `deploy/oci/04-install-docker.sh` | VM에 Docker Engine과 Compose plugin 설치 (1회) |
| `deploy/oci/05-deploy-compose-stack.sh` | 로컬에서 실행하는 compose 배포 script |
| `deploy/oci/compose.yml` | runtime stack (`caddy`, `readmates-api`, `redis`, `redpanda`) |
| `deploy/oci/Caddyfile` | `{$CADDY_SITE}` → `readmates-api:8080`, 민감 header를 뺀 stdout 로그 |
| `deploy/oci/readmates-stack.service` | compose를 감싸는 systemd unit |
| `deploy/oci/watch-compose-post-deploy.sh` | 배포 직후 watch helper |

VM 경로:

| 경로 | 내용 | 누가 만드나 |
| --- | --- | --- |
| `/etc/readmates/readmates.env` | Spring 운영 환경 변수 | `sync-config` workflow |
| `/etc/readmates/caddy.env` | `CADDY_SITE` | `05-deploy-compose-stack.sh` |
| `/opt/readmates/.env` | `READMATES_SERVER_IMAGE` | `05-deploy-compose-stack.sh` |
| `/opt/readmates/compose.yml`, `Caddyfile` | stack 정의 | `05-deploy-compose-stack.sh` |

## First Setup

1. VM에 Docker를 설치합니다.

   ```bash
   ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/04-install-docker.sh
   ```

2. deploy key와 `deploy` 사용자를 준비합니다: [VM deploy key bootstrap](../operations/runbooks/vm-deploy-key-bootstrap.md).
3. GitHub Actions `sync-config` workflow로 `/etc/readmates/readmates.env`를 만듭니다: [secrets management runbook](../operations/runbooks/secrets-management.md).
4. DB backup이 `/var/backups/readmates/mysql`에 쌓이도록 준비합니다: [oci-mysql-heatwave.md](oci-mysql-heatwave.md).

`05-deploy-compose-stack.sh`는 `readmates.env`를 만들거나 secret을 렌더링하지 않습니다. App container의 OTLP endpoint는 compose가 `http://tempo:4318/v1/traces`로 고정합니다.

## Preflight Stop Rules

아래 중 하나라도 맞지 않으면 `05-deploy-compose-stack.sh`를 실행하지 않습니다.

- VM의 `/etc/readmates/readmates.env`가 있고 권한이 `600`입니다.
- VM에서 Docker와 Compose plugin이 동작합니다. (script도 확인합니다)
- `/var/backups/readmates/mysql`에 최근 2일 안의 `*.sql.gz`가 있습니다. (script도 확인하고, 없으면 멈춥니다)
- GHCR package가 private이면 VM에서 registry login이 끝나 있습니다.
- legacy host `readmates-server`와 host `caddy`를 중지/disable해도 되는 작업 시간과 권한이 있습니다. script가 compose 시작 전에 둘을 중지합니다. 되돌릴 준비가 없으면 먼저 [Rollback](#rollback)을 준비합니다.

## Deploy

1. 서버 검증을 끝냅니다.

   ```bash
   ./scripts/server-ci-check.sh
   ./server/gradlew -p server integrationTest
   ```

2. 릴리즈라면 `Deploy Server Image`가 같은 tag에서 성공했는지 확인합니다.
3. 배포를 실행합니다.

   ```bash
   READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
   VM_PUBLIC_IP='<vm-public-ip>' \
   CADDY_SITE=api.example.com \
   READMATES_APP_BASE_URL=https://app.example.com \
   ./deploy/oci/05-deploy-compose-stack.sh
   ```

환경 변수:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `VM_PUBLIC_IP` | 예 | VM 주소 |
| `CADDY_SITE` | 예 | 직접 API HTTPS host, 예: `api.example.com` |
| `READMATES_SERVER_IMAGE` | 릴리즈 시 예 | `ghcr.io/`로 시작하면 VM에서 pull합니다. 그 밖의 값(기본 `readmates-server:local`)이면 로컬에서 `bootJar` + `docker build server` 후 VM으로 전송합니다(전환 검증용). |
| `READMATES_APP_BASE_URL` | 권장 | BFF smoke와 watch가 호출할 브라우저 origin. 생략하면 script 기본값을 씁니다. |
| `READMATES_SMOKE_AUTH_BASE_URL` | 선택 | watch의 OAuth `redirect_uri` 기준 origin. 기본은 `READMATES_APP_BASE_URL` |
| `SSH_KEY` | 선택 | 기본 `~/.ssh/readmates_oci` |
| `REMOTE_USER` | 선택 | 기본 `ubuntu` |
| `READMATES_RUN_POST_DEPLOY_WATCH` | 선택 | 기본 `true`. `false`면 watch를 건너뜁니다. |

완료 확인:

- script가 `Compose stack 배포 완료`까지 성공합니다.
- `readmates-stack` systemd unit이 active입니다.
- compose `readmates-api` health, BFF auth smoke, post-deploy watch가 통과합니다.
- Redis/Kafka 기능 flag는 별도 rollout 전까지 바꾸지 않습니다.

앱 배포는 `--remove-orphans`를 쓰지 않습니다. 같은 VM에서 관측 stack(Prometheus/Grafana/Alertmanager)이 같은 Compose project에 붙어 있을 수 있기 때문입니다. 필요 없는 legacy container는 `docker compose ps -a`와 현재 compose 파일을 대조한 뒤 운영자가 직접 정리합니다.

## Deploy Attempt Ledger

script는 VM의 `/var/log/readmates/deploy-attempts.jsonl`에 단계별 기록을 남깁니다. 자동 rollback이나 재시도 트리거가 아니라, 운영자가 실패 단계를 보고 판단하기 위한 기록입니다. 상태 모델과 단계별 대응은 [Deploy Attempts](../operations/runbooks/deploy-attempts.md)를 따릅니다.

- 기본 형식(`READMATES_LEDGER_FORMAT=both`)은 이벤트마다 두 줄을 씁니다.
  - legacy 줄: `attemptId`, `event`, `status`, `stage`, `at`, `durationSeconds`, 선택 `detail`(문자열)
  - JSON 줄: `ts`, `stage`, `event`, `status`, `detail`(key/value 객체), `attemptId`, `durationSeconds`
- `legacy` 또는 `json`으로 한 형식만 쓸 수 있습니다. 경로는 `READMATES_DEPLOY_LEDGER`로 바꿀 수 있습니다.
- `detail`에는 `image=...`, `imageId=...`, `exitCode=...` 같은 짧은 값만 들어갑니다. 외부에 공유하기 전 image 이름이 public-safe인지 확인합니다.
- env 파일 내용, DB host, password, secret, cookie, token, 요청/응답 전문, 실제 멤버 데이터는 기록하지 않습니다.

## Smoke

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'cd /opt/readmates && sudo docker compose -f compose.yml exec -T readmates-api /app/bin/readmates-http-get 127.0.0.1 8080 /internal/health'
curl -fsS https://app.example.com/api/bff/api/auth/me
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh
```

## Post-deploy Watch

BFF auth smoke가 통과하면 script가 `watch-compose-post-deploy.sh`를 실행합니다. watch는 `readmates-stack`/compose health, BFF auth smoke, OAuth redirect smoke, 최근 backend log의 `ERROR`/exception 패턴을 확인합니다.

watch 실패는 배포 실패로 기록되지만 자동 rollback은 하지 않습니다. 운영자가 ledger와 log를 보고 이전 image rollback이나 env 조사를 고릅니다. 수동 실행은 [Post-deploy Watch](../operations/runbooks/post-deploy-watch.md)를 봅니다.

## Rollback

### 서버 image만 되돌리기

`/opt/readmates/.env`의 `READMATES_SERVER_IMAGE`를 이전 tag로 바꾸고 `readmates-api`만 다시 올립니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" "ghcr.io/<owner>/<repo>/readmates-server:<previous-tag>" | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
```

migration이 있었던 릴리즈는 이전 image가 새 schema와 호환되는지 먼저 확인합니다. schema는 되돌리지 않습니다.

### Compose cutover 자체를 되돌리기 (legacy JAR + host Caddy)

전환 실패나 장애 대응용입니다.

1. compose stack을 멈춥니다.

   ```bash
   ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'sudo systemctl stop readmates-stack || true && sudo systemctl disable readmates-stack || true'
   ```

2. 검증된 JAR가 VM에 있는지 봅니다.

   ```bash
   ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'sudo test -s /opt/readmates/readmates-server.jar && sudo ls -lh /opt/readmates/readmates-server.jar'
   ```

3. 없으면 로컬에서 다시 올립니다.

   ```bash
   ./server/gradlew -p server bootJar
   VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
   ```

4. legacy host 서비스를 Spring → Caddy 순서로 올립니다.

   ```bash
   ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'sudo systemctl enable --now readmates-server && sudo systemctl enable --now caddy && sudo systemctl status readmates-server --no-pager && sudo systemctl status caddy --no-pager'
   ```

`readmates-server` systemd unit은 저장소에 없습니다. legacy 경로를 쓰려면 VM에 unit이 남아 있어야 합니다.

## Redis and Kafka Flags

compose 안의 endpoint는 `redis://redis:6379`, `redpanda:9092`이며 compose가 container에 주입합니다. Redis를 먼저 켜고, 안정된 뒤 알림/Kafka를 따로 켭니다. 값은 `sync-config`로 반영하고 `readmates-api`를 재시작해야 적용됩니다.

Redis 순서:

```bash
READMATES_REDIS_ENABLED=true
READMATES_RATE_LIMIT_ENABLED=true
READMATES_AUTH_SESSION_CACHE_ENABLED=true
READMATES_PUBLIC_CACHE_ENABLED=true
READMATES_NOTES_CACHE_ENABLED=true
```

Kafka 순서:

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_KAFKA_ENABLED=true
```
