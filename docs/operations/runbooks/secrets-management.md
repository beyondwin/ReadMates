# Secrets Management (no-SSH)

> **목적:** 시크릿/설정 추가·회전을 SSH 0회로 완료.
> **선결 조건:** `vm-deploy-key-bootstrap.md` 완료.

## 신규 시크릿 추가 (4 step)

### 1. GitHub Repository Secrets 등록

GitHub Repo → **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**.

| 항목 | 값 |
|---|---|
| Name | 예: `READMATES_AIGEN_GEMINI_API_KEY` (대문자 + 언더스코어, `.env` 키 그대로) |
| Secret | 값 평문 (붙여넣은 후 GitHub 가 암호화) |

### 2. `.env.example` + workflow env 매핑 PR

- `.env.example` 에 키 추가 (값은 `<placeholder>`, 주석으로 `# PROD via GitHub Secret READMATES_...`)
- `.github/workflows/sync-config.yml` 의 `REQUIRED_SECRETS` 배열 + `env:` 블록 + heredoc 본문에 키 추가
- PR 머지

### 3. workflow 실행

GitHub Actions 탭 → **sync-config** → Run workflow → input `restart_api=true` (env 파일만 갱신하고 다음 배포에 묶고 싶으면 `false`) → Run.

`production` environment 승인 클릭 → 완료까지 ~30초.

### 4. 검증

```bash
curl -fsS https://api.<domain>/actuator/health
```

`{"status":"UP"}` 확인.

#### 시크릿 회전

위와 동일. Step 1에서 기존 secret 의 값만 교체 ("Update" 버튼).

회전 직후 인플라이트 트래픽 끊김 우려가 있다면:
- `BFF_SECRET` 같은 회전 가능 키는 `READMATES_BFF_SECRETS` (콤마 구분 리스트) 에 신규+기존 같이 두고 단계적 회전:
  1. 신규 secret 추가, `READMATES_BFF_SECRETS=new,old` 로 sync → restart
  2. Cloudflare Pages 측 secret 도 동기화
  3. 일정 시간 후 `READMATES_BFF_SECRETS=new` 로 단축 → sync → restart

Host cursor와 mutation identity HMAC key는 각자 versioned current/previous 쌍으로 회전합니다. 실제 값은
로그, 명령 인자, evidence에 남기지 않습니다.

1. 새 key를 current Secret으로 provision하고 새 version Variable을 설정합니다. 기존 key/version은
   previous Secret/Variable로 함께 둡니다.
2. `sync-config(restart_api=false, dry_run=false)`로 env를 먼저 렌더링한 뒤 backend를 재시작합니다.
3. Cursor는 이전 TTL + 24시간 rollout buffer, mutation identity는 참조 row가 0이 된 뒤 durable
   `unreferenced_since` + 24시간 rollout buffer가 모두 지난 것을 public-safe preflight로 확인합니다.
4. 그 전에는 previous key를 제거하지 않습니다. 안전 경계 전에 제거한 mutation key는 다음 startup에서
   fail closed합니다.
5. 안전 경계를 확인한 뒤에만 previous Secret을 명시적으로 삭제합니다. GitHub UI에서는
   **Settings → Secrets and variables → Actions → Repository secrets**에서 정확한 previous key를 열어
   **Delete secret**을 실행합니다. CLI를 쓰면 대상 repository를 명시하고 필요한 key만 삭제합니다.

   ```bash
   gh secret delete READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY --repo <owner>/<repo>
   gh secret delete READMATES_MUTATION_IDENTITY_PREVIOUS_KEY --repo <owner>/<repo>
   ```

   회전하지 않은 key의 명령은 실행하지 않습니다. Bulk importer에서 빈 값을 읽는 것은 기존 GitHub
   Secret 삭제가 아니며 importer는 secret 삭제를 수행하지 않습니다. Previous version Variable은 retired
   version으로 유지합니다.
6. 삭제 뒤 `sync-config(restart_api=false, dry_run=false)`를 실행해 빈 previous 값이 env에 렌더링되는지
   확인한 다음 backend를 재시작합니다.

Platform-admin command digest key는 alias lifecycle 때문에 별도 순서를 지킵니다.

1. 새 key/version을 current로, 기존 key/version을 previous로 provision하고
   `READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=true`로 설정합니다. Backend보다 먼저
   `sync-config(restart_api=false, dry_run=false)`를 실행한 뒤 재시작하여 current/previous dual-write를
   시작합니다. Startup의 database-backed validator가 key state와 alias reference를 잠금 조회해 통과해야
   합니다.
2. 이전 버전 writer가 모두 drain되었음을 확인합니다. Drain 전에는 current-only write로 전환하지 않습니다.
3. `READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false`로 바꾸고 sync/restart합니다. 이 단계는 새
   alias를 current로만 쓰되 response-loss lookup에는 previous key를 유지합니다.
4. Completion 기준 `READMATES_ADMIN_COMMAND_IDEMPOTENCY_RETENTION`이 지난 claim을
   `READMATES_ADMIN_COMMAND_IDEMPOTENCY_PURGE_BATCH_SIZE`와
   `READMATES_ADMIN_COMMAND_IDEMPOTENCY_PURGE_INTERVAL`의 bounded purge로 제거합니다. Previous alias reference가
   0이고 durable `unreferenced_since`가 기록되었음을 DB 운영 증거로 확인합니다.
5. 그 `unreferenced_since`부터
   `READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_ROLLOUT_BUFFER`(기본 24시간) 이상 기다립니다. Reference 또는
   timestamp를 확인할 수 없으면 제거하지 않습니다.
6. 안전 경계를 확인한 뒤에만 대상 repository를 명시해 previous Secret 하나를 삭제합니다. 아래 명령은
   runbook 예시이며 이 저장소 자동화가 대신 실행하지 않습니다.

   ```bash
   gh secret delete READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY --repo <owner>/<repo>
   ```

7. `sync-config(restart_api=false, dry_run=false)`로 빈 previous 값을 렌더링하고 backend를 재시작합니다.
   재시작 뒤 database-backed startup validator와 health를 확인합니다. Bulk importer의 빈 previous 값은
   기존 Secret을 삭제하지 않으므로 6단계의 명시적 삭제를 대체하지 않습니다.

첫 V52–V57 배포는 host cursor, host mutation identity, admin command digest의 세 current key를 backend
startup/Flyway보다 먼저 provision해야 합니다. Previous
version `0`과 빈 previous key는 history가 없는 첫 배포에서만 안전한 기본값입니다.

#### 시크릿 인벤토리 (현재)

| 키 | 타입 | 소유 | 회전 주기 권장 |
|---|---|---|---|
| `READMATES_DEPLOY_SSH_KEY` | Secret | infra | 연 1회 또는 사고 시 |
| `READMATES_VM_KNOWN_HOSTS` | Secret | infra | 호스트 교체 시 |
| `SPRING_DATASOURCE_PASSWORD` | Secret | DB | 분기 1회 |
| `SPRING_DATASOURCE_URL` | Secret | DB | 호스트 이전 시 |
| `SPRING_DATASOURCE_USERNAME` | Secret | DB | 변경 거의 없음 |
| `READMATES_AUTH_RETURN_STATE_SECRET` | Secret | auth | 분기 1회 |
| `READMATES_BFF_SECRET` | Secret | auth | 분기 1회 (Cloudflare Pages 측 동기화 필요) |
| `READMATES_BFF_SECRETS` | Secret | auth | 회전 시에만 |
| `READMATES_IP_HASH_BASE_SECRET` | Secret | audit | 거의 변경 안 함 (변경 시 기존 해시 무효) |
| `READMATES_HOST_LIST_CURSOR_CURRENT_KEY` | Secret | host cursor | versioned rotation |
| `READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY` | Secret | host cursor | rotation window에만 |
| `READMATES_MUTATION_IDENTITY_CURRENT_KEY` | Secret | host mutation | versioned rotation |
| `READMATES_MUTATION_IDENTITY_PREVIOUS_KEY` | Secret | host mutation | durable retirement 뒤 제거 |
| `READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY` | Secret | platform-admin command | versioned rotation |
| `READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY` | Secret | platform-admin command | alias purge와 durable retirement 뒤 제거 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID` | Secret | OAuth | 신청 시 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET` | Secret | OAuth | 분기 1회 (Google Cloud Console) |
| `READMATES_AIGEN_OPENAI_API_KEY` | Secret | AI | 분기 1회 또는 사고 시 |
| `READMATES_AIGEN_ANTHROPIC_API_KEY` | Secret | AI | 분기 1회 |
| `READMATES_AIGEN_GEMINI_API_KEY` | Secret | AI | 분기 1회 |
| `SPRING_MAIL_USERNAME` | Secret | SMTP | 거의 변경 안 함 |
| `SPRING_MAIL_PASSWORD` | Secret | SMTP | 분기 1회 |

**Variables (비민감):**

GitHub Variables 로 관리하는 것 — 환경 의존적인 값:

| 키 | 비고 |
|---|---|
| `READMATES_VM_HOST` | VM 공인 IP 또는 호스트명 |
| `READMATES_APP_BASE_URL` | `https://readmates.pages.dev` |
| `READMATES_AUTH_BASE_URL` | 보통 APP_BASE_URL과 동일 |
| `READMATES_ALLOWED_ORIGINS` | CORS 허용 origin (콤마 구분) |
| `READMATES_HOST_LIST_CURSOR_CURRENT_KEY_VERSION` / `PREVIOUS_KEY_VERSION` | current/previous cursor key version (`1` / `0` first-deploy default) |
| `READMATES_MUTATION_IDENTITY_CURRENT_KEY_VERSION` / `PREVIOUS_KEY_VERSION` | current/previous mutation digest key version (`1` / `0` first-deploy default) |
| `READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION` / `PREVIOUS_KEY_VERSION` | current/previous admin command digest key version (`1` / `0` first-deploy default) |
| `READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS` | rotation dual-write overlap에서만 `true`; 기본 `false` |
| `READMATES_ADMIN_COMMAND_IDEMPOTENCY_RETENTION` | completed operational claim 보존 (`168h` 기본) |
| `READMATES_ADMIN_COMMAND_IDEMPOTENCY_INITIAL_CLAIM_TTL` | initial claim TTL (`15m` 기본) |
| `READMATES_ADMIN_COMMAND_IDEMPOTENCY_PURGE_BATCH_SIZE` | purge pass당 상한 (`100` 기본) |
| `READMATES_ADMIN_COMMAND_IDEMPOTENCY_PURGE_INTERVAL` | bounded purge 간격 (`1h` 기본) |
| `READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_ROLLOUT_BUFFER` | zero-reference 확인 뒤 key 제거 전 대기 (`24h` 기본) |
| `READMATES_PUBLIC_CONVERGENCE_MAINTENANCE_ENABLED` | provider/feature와 독립인 operational purge (`true` 기본) |
| `READMATES_PUBLIC_CONVERGENCE_WORK_RETENTION` | work 보존 기간 (`168h` 기본, startup 범위 `1h..30d`) |
| `READMATES_PUBLIC_CONVERGENCE_MAINTENANCE_FIXED_DELAY` | purge 간격 (`1h` 기본, 최대 `24h`) |
| `READMATES_PUBLIC_CONVERGENCE_MAINTENANCE_BATCH_SIZE` | pass당 삭제 상한 (`100` 기본, 범위 `1..500`) |
| `SPRING_MAIL_HOST` | SMTP host, 예: `smtp.gmail.com` |
| `READMATES_NOTIFICATION_SENDER_EMAIL` | 발신자 주소 |
| `READMATES_NOTIFICATION_SENDER_NAME` | 발신자 표시 이름 |
| `READMATES_AIGEN_ENABLED` | `true`/`false` (kill-switch) |
| `READMATES_AIGEN_ENABLED_PROVIDERS` | 화이트리스트, 예: `OPENAI` |
| `READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED` | 기본 `false`; Gemini key의 active billing/paid terms를 운영자가 확인한 뒤에만 `true` |

`sync-config`가 render하지 않는 compose 배포 입력은 GitHub Variables inventory와 분리합니다. 운영자는 `deploy/oci/05-deploy-compose-stack.sh` 실행 시 `CADDY_SITE`와 `READMATES_SERVER_IMAGE`를 주입합니다. Script가 각각 `/etc/readmates/caddy.env`와 `/opt/readmates/.env`에 기록하며, `/etc/readmates/readmates.env`의 secret rendering에는 사용하지 않습니다.

워크플로 YAML 에 인라인된 값들 — GitHub 등록 불필요. 변경하려면 워크플로 PR:

| 키 | 인라인 값 | 사유 |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | 운영 고정 |
| `VM_USER` | `deploy` | runbook 으로 고정 |
| `VM_PORT` | `2222` | runbook 으로 고정 (비표준 포트) |
| `DEPLOY_ROOT` | `/opt/readmates` | compose.yml 위치 고정 |
| `READMATES_BFF_SECRET_REQUIRED` | `true` | prod 정책 |
| `READMATES_AUTH_SESSION_COOKIE_SECURE` | `true` | prod 정책 |
| `READMATES_AIGEN_FALLBACK_DEFAULT_MODEL` | `gpt-5.4-mini` | application.yml default 와 동기화 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE` | `openid,email,profile` | Google OAuth 표준 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI` | `${APP_BASE_URL}/login/oauth2/code/google` | APP_BASE_URL 에서 파생 |
| `SPRING_MAIL_PORT` | `587` | Gmail/STARTTLS 표준 |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH` / `STARTTLS_ENABLE` | `true` | Gmail/STARTTLS 표준 |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT` / `TIMEOUT` / `WRITETIMEOUT` | `5000` | 5s 표준 |
| `READMATES_KAFKA_NOTIFICATION_SEND_TIMEOUT` | `10s` | claim lease보다 짧은 Kafka publish timeout |
| `READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE` / `MAX_PUBLISH_ATTEMPTS` | `50` / `5` | relay 처리량과 attempt ceiling |
| `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES` | `5,15,60,240` | relay와 delivery가 공유하는 retry schedule |
| `READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS` | `5` | delivery attempt ceiling |
| `READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS` / `CLAIM_LEASE` | `30s` / `15m` | scheduler delay와 exact claim lease. Lease는 최대 `24h`이고 두 max age보다 짧아야 함 |
| `READMATES_NOTIFICATION_EVENT_MAX_AGE` / `DELIVERY_MAX_AGE` | `24h` / `24h` | relay와 delivery deadline |
| `READMATES_NOTIFICATION_BACKLOG_REFRESH_INTERVAL` / `BACKLOG_INITIAL_DELAY` | `60s` / `5s` | backlog snapshot refresh |
| `READMATES_NOTIFICATION_ADMIN_REPLAY_PREVIEW_TTL` / `MAX_TARGETS` | `10m` / `1000` | 관리자 delivery replay preview 만료 시간과 한 번에 허용할 최대 대상 수 |
| `SERVER_FORWARD_HEADERS_STRATEGY` | `framework` | Caddy reverse-proxy 뒤 fixed |
| `READMATES_REDIS_ENABLED` / `RATE_LIMIT_ENABLED` / `AUTH_SESSION_CACHE_ENABLED` / `PUBLIC_CACHE_ENABLED` / `NOTES_CACHE_ENABLED` / `NOTIFICATIONS_ENABLED` / `KAFKA_ENABLED` | `true` | prod 표준 (전부 활성) |

**bulk import:** 기존 운영 `readmates.env` 가 있다면 `scripts/sync-config/import-from-prod-env.sh <path>` 로 일괄 등록. dry-run 기본; `--apply` 로 실제 적용. 레포 외부 경로만 허용 (실수 commit 방지).

#### 보안 수칙

- 시크릿 값을 **PR description, commit message, issue, Slack** 등에 절대 평문으로 적지 않는다 (인덱싱·fork 노출 위험).
- 워크플로 디버깅 시 `echo`, `set -x`, `env`, `cat readmates.env` 금지.
- 로컬 `.env` 에 운영 시크릿을 복사하지 않는다 — 운영 데이터 접근은 VM에서 직접 (감사 가능).
- 시크릿 누출 의심 시: 해당 키 즉시 회전 + Audit (`Settings → Audit log`) 에서 접근 이력 확인.

#### 비상: workflow 실패

| 증상 | 처리 |
|---|---|
| 필수 secret 누락으로 step 1 실패 | 누락된 키 GitHub Secrets에 등록 후 재실행 |
| scp/ssh 연결 실패 | VM 네트워크/방화벽 확인. known_hosts 변경됐다면 `READMATES_VM_KNOWN_HOSTS` 갱신 |
| `docker compose up` 실패 | workflow가 `.bak` 자동 복원 + 재시작. 실패 메시지 + 컨테이너 로그 확인 |
| `.bak` 복원도 실패 | admin SSH로 직접 개입: `sudo cp /etc/readmates/readmates.env.bak /etc/readmates/readmates.env && sudo docker compose -f /opt/readmates/compose.yml up -d --force-recreate readmates-api` |

## Notification SMTP boundary

SMTP username/password만 secret이다. Host와 connection/read/write timeout(각 `5s`)은 공개 운영 설정이며 sync-config가 렌더링한다. 세 timeout 합계는 notification claim lease보다 짧아야 한다. Claim lease는 최대 `24h`이고 event/delivery max age보다 각각 엄격히 짧아야 하며, startup validation 실패 시 credential을 출력하지 말고 property path만 확인한다.

관리자 delivery replay 설정도 비민감 고정 운영값으로 렌더링한다. `READMATES_NOTIFICATION_ADMIN_REPLAY_PREVIEW_TTL=10m`은 `1m..1h` 범위의 whole-millisecond duration이어야 하고, `READMATES_NOTIFICATION_ADMIN_REPLAY_MAX_TARGETS=1000`은 `1..5000` 범위여야 한다. 범위를 벗어나면 서버는 해당 property path를 포함해 시작에 실패한다.
