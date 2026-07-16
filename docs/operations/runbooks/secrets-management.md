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
| `SPRING_MAIL_HOST` | SMTP host, 예: `smtp.gmail.com` |
| `READMATES_NOTIFICATION_SENDER_EMAIL` | 발신자 주소 |
| `READMATES_NOTIFICATION_SENDER_NAME` | 발신자 표시 이름 |
| `READMATES_AIGEN_ENABLED` | `true`/`false` (kill-switch) |
| `READMATES_AIGEN_ENABLED_PROVIDERS` | 화이트리스트, 예: `OPENAI` |
| `READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED` | 기본 `false`; Gemini key의 active billing/paid terms를 운영자가 확인한 뒤에만 `true` |
| `CADDY_SITE` | Caddy 도메인 |
| `READMATES_SERVER_IMAGE` | GHCR image ref |

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
