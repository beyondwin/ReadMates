# Secrets Management (no-SSH)

> **목적:** SSH 없이 시크릿과 운영 설정을 추가하거나 회전합니다.
> **선결 조건:** [VM deploy key bootstrap](vm-deploy-key-bootstrap.md) 완료.
> **도구:** GitHub Repository Secrets/Variables + `.github/workflows/sync-config.yml`

`sync-config`는 GitHub Secrets/Variables와 워크플로 안의 고정값으로 `/etc/readmates/readmates.env`를 새로 만들어 VM에 올립니다. VM의 기존 파일은 `readmates.env.bak`으로 백업합니다.

## 신규 시크릿 추가 (4 step)

### 1. GitHub에 값 등록

GitHub Repo → **Settings → Secrets and variables → Actions**.

- 민감한 값은 **Secrets**, 환경마다 다른 비민감 값은 **Variables**에 넣습니다.
- 이름은 `.env` 키와 같게 씁니다. 예: `READMATES_AIGEN_GEMINI_API_KEY`.

### 2. 워크플로와 `.env.example` 수정 PR

- `.env.example`에 키를 추가합니다. 값은 `<placeholder>`로 둡니다.
- `.github/workflows/sync-config.yml`에서
  - job `env:` 블록에 `${{ secrets.X }}` 또는 `${{ vars.X }}` 매핑을 추가하고,
  - "Render readmates.env" step에 `printf 'X=%s\n' "$X"` 줄을 추가합니다.
  - 필수 값이면 "Assert required secrets present" step의 `required=(...)` 배열에도 넣습니다.
- PR을 머지합니다.

### 3. 워크플로 실행

GitHub Actions → **sync-config** → Run workflow.

| input | 기본 | 의미 |
| --- | --- | --- |
| `restart_api` | `false` | `true`면 env 설치 후 `readmates-api`를 재생성합니다. `false`면 다음 배포나 재시작 때 반영됩니다. |
| `dry_run` | `false` | `true`면 env 렌더링만 하고 VM에 접속하지 않습니다. |

`production` environment 승인이 필요합니다.

### 4. 검증

```bash
curl -fsS https://api.example.com/internal/health
# {"status":"UP","kind":"liveness"}
```

`/internal/health`는 liveness만 봅니다. 새 값이 기능에 반영됐는지는 BFF smoke(`GET https://app.example.com/api/bff/api/auth/me`)나 해당 기능으로 확인합니다. Actuator(`/actuator/health`)는 내부 management port(8081)라 공개 host로는 닿지 않습니다.

### 시크릿 회전

위 절차와 같습니다. Step 1에서 기존 secret 값만 바꿉니다("Update").

BFF secret은 끊김 없이 단계적으로 바꿀 수 있습니다.

1. `READMATES_BFF_SECRETS=new,old`로 sync → restart.
2. Cloudflare Pages 쪽 secret을 새 값으로 맞춥니다.
3. 충분히 기다린 뒤 `READMATES_BFF_SECRETS=new`로 줄이고 sync → restart.

## 시크릿 인벤토리 (현재)

### Secrets

| 키 | 소유 | 회전 주기 권장 |
|---|---|---|
| `READMATES_DEPLOY_SSH_KEY` | infra | 연 1회 또는 사고 시 |
| `READMATES_VM_KNOWN_HOSTS` | infra | 호스트 교체 시 |
| `SPRING_DATASOURCE_URL` | DB | 호스트 이전 시 |
| `SPRING_DATASOURCE_USERNAME` | DB | 거의 없음 |
| `SPRING_DATASOURCE_PASSWORD` | DB | 분기 1회 |
| `READMATES_AUTH_RETURN_STATE_SECRET` | auth | 분기 1회 |
| `READMATES_BFF_SECRET` | auth | 분기 1회 (Cloudflare Pages와 함께) |
| `READMATES_BFF_SECRETS` | auth | 회전할 때만 |
| `READMATES_IP_HASH_BASE_SECRET` | audit | 거의 없음 (바꾸면 기존 해시 무효) |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID` | OAuth | 재발급 시 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET` | OAuth | 분기 1회 |
| `READMATES_AIGEN_OPENAI_API_KEY` | AI | 분기 1회 또는 사고 시 |
| `READMATES_AIGEN_ANTHROPIC_API_KEY` | AI | 분기 1회 |
| `READMATES_AIGEN_GEMINI_API_KEY` | AI | 분기 1회 |
| `SPRING_MAIL_USERNAME` | SMTP | 거의 없음 |
| `SPRING_MAIL_PASSWORD` | SMTP | 분기 1회 |

### Variables (비민감)

| 키 | 비고 |
|---|---|
| `READMATES_VM_HOST` | VM 공인 IP 또는 호스트명 |
| `READMATES_APP_BASE_URL` | 예: `https://app.example.com` |
| `READMATES_AUTH_BASE_URL` | 보통 APP_BASE_URL과 같음 |
| `READMATES_ALLOWED_ORIGINS` | CORS 허용 origin (콤마 구분) |
| `SPRING_MAIL_HOST` | SMTP host |
| `READMATES_NOTIFICATION_SENDER_EMAIL` / `SENDER_NAME` | 발신 주소와 표시 이름 |
| `READMATES_AIGEN_ENABLED` | `true`/`false` (AI kill switch) |
| `READMATES_AIGEN_ENABLED_PROVIDERS` | provider allowlist, 예: `OPENAI` |
| `READMATES_AIGEN_KAFKA_ENABLED` / `KAFKA_BOOTSTRAP_SERVERS` | AI를 켜면 Kafka도 켜야 합니다. bootstrap은 compose 서비스 `redpanda:9092` |
| `READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED` | 기본 `false`. Gemini key의 paid tier를 운영자가 확인한 뒤에만 `true` |
| `READMATES_AIGEN_*` (선택) | `GROUNDED_RESERVED_OUTPUT_TOKENS`, `KAFKA_CONSUMER_RETRY_DELAY`, `KAFKA_CONSUMER_MAX_ATTEMPTS`, `PROCESSING_DEADLINE`, `RECOVERY_*`, `QUEUE_PROBE_FIXED_DELAY`. 비우면 워크플로 기본값 |

`CADDY_SITE`와 `READMATES_SERVER_IMAGE`는 `sync-config`가 다루지 않습니다. 운영자가 `deploy/oci/05-deploy-compose-stack.sh` 실행 때 넘기고, 스크립트가 각각 `/etc/readmates/caddy.env`, `/opt/readmates/.env`에 씁니다.

### 워크플로 고정값

GitHub에 등록하지 않습니다. 바꾸려면 워크플로 PR을 냅니다.

| 키 | 값 | 이유 |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | 운영 고정 |
| `VM_USER` / `VM_PORT` / `DEPLOY_ROOT` | `deploy` / `2222` / `/opt/readmates` | [VM deploy key bootstrap](vm-deploy-key-bootstrap.md)과 같은 값 |
| `READMATES_BFF_SECRET_REQUIRED` | `true` | prod 정책 |
| `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED` | `true` | backend 먼저 배포할 때 구버전 BFF의 host 쓰기를 막음 |
| `READMATES_AUTH_SESSION_COOKIE_SECURE` | `true` | prod 정책 |
| `READMATES_AIGEN_FALLBACK_DEFAULT_MODEL` | `gpt-5.4-mini` | `application.yml` 기본값과 동일 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE` | `openid,email,profile` | Google OAuth 표준 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI` | `${APP_BASE_URL}/login/oauth2/code/google` | APP_BASE_URL에서 파생 |
| `SPRING_MAIL_PORT` | `587` | STARTTLS |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH` / `STARTTLS_ENABLE` | `true` | STARTTLS |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT` / `TIMEOUT` / `WRITETIMEOUT` | `5000` | 각 5초 |
| `READMATES_KAFKA_NOTIFICATION_SEND_TIMEOUT` | `10s` | claim lease보다 짧은 publish timeout |
| `READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE` / `MAX_PUBLISH_ATTEMPTS` | `50` / `5` | relay 처리량과 시도 상한 |
| `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES` | `5,15,60,240` | relay와 delivery 공통 retry 간격 |
| `READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS` | `5` | delivery 시도 상한 |
| `READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS` / `CLAIM_LEASE` | `30s` / `15m` | scheduler 간격과 claim lease |
| `READMATES_NOTIFICATION_EVENT_MAX_AGE` / `DELIVERY_MAX_AGE` | `24h` / `24h` | relay와 delivery deadline |
| `READMATES_NOTIFICATION_BACKLOG_REFRESH_INTERVAL` / `BACKLOG_INITIAL_DELAY` | `60s` / `5s` | backlog snapshot 갱신 |
| `READMATES_NOTIFICATION_ADMIN_REPLAY_PREVIEW_TTL` / `MAX_TARGETS` | `10m` / `1000` | 관리자 replay preview 만료와 최대 대상 수 |
| `SERVER_FORWARD_HEADERS_STRATEGY` | `framework` | Caddy reverse proxy 뒤 |
| `READMATES_REDIS_ENABLED` / `RATE_LIMIT_ENABLED` / `AUTH_SESSION_CACHE_ENABLED` / `PUBLIC_CACHE_ENABLED` / `NOTES_CACHE_ENABLED` / `NOTIFICATIONS_ENABLED` / `KAFKA_ENABLED` | `true` | prod 표준 (전부 켬) |

### 일괄 등록

기존 운영 env 파일이 있으면 `scripts/sync-config/import-from-prod-env.sh <env-file>`로 한 번에 등록합니다. 기본은 dry-run이고 `--apply`를 붙여야 실제로 씁니다. 저장소 밖 경로만 받습니다.

## 보안 수칙

- 시크릿 값을 PR 설명, commit message, issue, 채팅에 평문으로 쓰지 않습니다.
- 워크플로 디버깅 때 `echo`, `set -x`, `env`, `cat readmates.env`를 쓰지 않습니다.
- 로컬 `.env`에 운영 시크릿을 복사하지 않습니다.
- 누출이 의심되면 해당 키를 즉시 회전하고 GitHub `Settings → Audit log`에서 접근 이력을 봅니다.

## 비상: workflow 실패

| 증상 | 처리 |
|---|---|
| "Assert required secrets present" 실패 | 로그에 나온 누락 키를 GitHub에 등록하고 재실행 |
| scp/ssh 연결 실패 | VM 네트워크/방화벽 확인. host key가 바뀌었으면 `READMATES_VM_KNOWN_HOSTS` 갱신 |
| `readmates-api` 재시작 실패 | 워크플로가 `.bak`으로 자동 복원하고 다시 재시작합니다. 로그와 컨테이너 로그를 확인 |
| `.bak` 복원도 실패 | admin SSH로 직접 복구: `sudo install -m 600 -o deploy /etc/readmates/readmates.env.bak /etc/readmates/readmates.env && sudo docker compose -f /opt/readmates/compose.yml up -d --force-recreate readmates-api` |

## Notification SMTP boundary

- SMTP username/password만 secret입니다. host와 connect/read/write timeout(각 5초)은 공개 운영값이고 `sync-config`가 렌더링합니다.
- 세 timeout 합은 notification claim lease보다 짧아야 합니다. claim lease는 최대 `24h`이고 event/delivery max age보다 각각 짧아야 합니다.
- 관리자 replay 값 범위: `READMATES_NOTIFICATION_ADMIN_REPLAY_PREVIEW_TTL`은 `1m..1h`, `READMATES_NOTIFICATION_ADMIN_REPLAY_MAX_TARGETS`는 `1..5000`.
- 범위를 벗어나면 서버가 property path를 포함한 메시지와 함께 시작에 실패합니다. credential은 출력하지 말고 property path만 확인합니다.
