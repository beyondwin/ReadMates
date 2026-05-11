# External Operations Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 운영 자동화 도구에서 확인한 운영 패턴을 ReadMates의 OCI Compose 배포 체계에 맞게 반영해 runbook, read-only diagnostics, deploy attempt ledger, image verification, post-deploy watch, script CI gate, public release safety CI, release tag workflow 검증을 추가한다.

**Architecture:** 기존 Cloudflare Pages + GHCR + OCI Docker Compose 구조는 유지한다. 새 작업은 docs, deploy shell scripts, GitHub Actions CI/CD workflow만 건드리며 frontend/server application code와 DB schema는 변경하지 않는다. 배포 상태는 VM의 sanitized JSONL ledger에 남기고, public repo에는 절차와 placeholder-safe script만 둔다. Backend production VM 반영은 GitHub Actions SSH 배포로 자동화하지 않고 운영자가 `deploy/oci/05-deploy-compose-stack.sh`를 수동 실행하는 구조를 유지한다.

**Tech Stack:** Bash, Docker Compose, systemd, GitHub Actions, Markdown, existing public-release scanner.

**Spec:** `docs/superpowers/specs/2026-05-11-external-operations-adoption-design.md`

---

## File Map

Create:

- `docs/operations/runbooks/README.md` — runbook index and safety rules.
- `docs/operations/runbooks/deploy-attempts.md` — deploy attempt state model, ledger fields, failure handling.
- `docs/operations/runbooks/read-only-diagnostics.md` — ForceCommand diagnostic key runbook and threat model.
- `docs/operations/runbooks/post-deploy-watch.md` — post-deploy observation procedure.
- `deploy/oci/readmates-collect.sh` — read-only OCI Compose diagnostic collector.
- `deploy/oci/install-readmates-collector.sh` — installs collector to `/usr/local/bin/readmates-collect`.
- `deploy/oci/watch-compose-post-deploy.sh` — bounded post-deploy health, smoke, and log scan.

Modify:

- `docs/operations/README.md` — link runbooks alongside post-mortems and observability.
- `docs/deploy/compose-stack.md` — document attempt ledger, image digest/id verification, post-deploy watch.
- `docs/deploy/oci-backend.md` — link collector and watch procedures from backend deploy runbook.
- `scripts/README.md` — mention new deploy scripts are included in public release candidate checks.
- `scripts/build-public-release-candidate.sh` — ensure new `deploy/oci/*.sh` files are copied by the existing `deploy/oci` manifest and no new forbidden paths are required.
- `scripts/public-release-check.sh` — update only if the new runbook paths need allowlist coverage.
- `.github/workflows/ci.yml` — add shell script syntax/lint job.
- `.github/workflows/ci.yml` — add public release safety job and failure artifact upload for test reports.
- `.github/workflows/deploy-front.yml` — add release fixture drift check and production environment boundary.
- `.github/workflows/deploy-server.yml` — add release server test gate, SBOM/provenance, image scan, and production environment boundary.
- `deploy/oci/05-deploy-compose-stack.sh` — add attempt ledger, stage tracking, image verification, post-deploy watch call.

Do not modify:

- `front/**`
- `server/src/**`
- `server/src/main/resources/db/mysql/migration/**`
- Cloudflare Pages Functions
- production runtime env files

---

## Task 1: Add Operations Runbook Index

**Files:**

- Create: `docs/operations/runbooks/README.md`
- Modify: `docs/operations/README.md`

- [ ] **Step 1: Create `docs/operations/runbooks/README.md`**

Use this exact content:

```markdown
# Runbooks

ReadMates 운영자가 반복적으로 수행하는 배포, 진단, 장애 대응 절차를 모은 문서입니다. 배포 대상의 실제 VM IP, private host, OAuth secret, BFF secret, DB password, SMTP credential, smoke 결과 전문은 Git에 기록하지 않습니다.

## 원칙

- 실패한 배포나 진단 명령을 자동 재시도하지 않습니다. 실패 stage와 증거를 남기고 운영자가 다음 행동을 결정합니다.
- 운영 진단은 가능한 한 읽기 전용 command로 제한합니다.
- Claude나 다른 자동화 도구에 production 진단을 맡길 때는 진단 전용 SSH 키와 server-side ForceCommand를 사용합니다.
- runbook command에는 placeholder를 사용합니다. 실제 값은 VM, provider console, 또는 Git 밖 운영 채널에서만 다룹니다.

## 문서

- [Deploy attempts](deploy-attempts.md) — 배포 attempt 상태 모델, JSONL ledger, 실패 stage별 대응.
- [Read-only diagnostics](read-only-diagnostics.md) — 진단 전용 SSH 키와 collector 운영.
- [Post-deploy watch](post-deploy-watch.md) — 배포 직후 health, BFF/OAuth smoke, recent log scan 절차.

## 관련 문서

- [OCI Compose Stack](../../deploy/compose-stack.md)
- [OCI backend](../../deploy/oci-backend.md)
- [Observability](../observability/README.md)
- [Post-mortems](../postmortems/README.md)
```

- [ ] **Step 2: Update `docs/operations/README.md`**

Replace the current subdocument list and remove the runbook follow-up section so it reads:

```markdown
# Operations

ReadMates 운영 관련 문서를 모은 진입점입니다. 배포 절차는 `docs/deploy/`, 개발 절차는 `docs/development/`를 참조하세요.

## 하위 문서

- [Runbooks](runbooks/README.md) — 반복 운영 절차, 배포 attempt, 읽기 전용 진단, 배포 후 관찰.
- [Post-mortems](postmortems/README.md) — 발생한 incident의 회고 기록.
- [Observability](observability/README.md) — 메트릭, 대시보드, 알림 룰, SLO.
```

- [ ] **Step 3: Verify links**

Run:

```bash
test -f docs/operations/runbooks/README.md
test -f docs/operations/postmortems/README.md
test -f docs/operations/observability/README.md
rg -n "runbooks/README.md|postmortems/README.md|observability/README.md" docs/operations/README.md
```

Expected: all `test` commands exit 0 and `rg` prints the three links.

- [ ] **Step 4: Commit**

```bash
git add docs/operations/README.md docs/operations/runbooks/README.md
git commit -m "docs: add operations runbook index"
```

---

## Task 2: Document Deploy Attempt Model

**Files:**

- Create: `docs/operations/runbooks/deploy-attempts.md`

- [ ] **Step 1: Create `deploy-attempts.md`**

Use this exact content:

```markdown
# Deploy Attempts

ReadMates backend 배포는 한 번의 명시적 attempt로 기록합니다. Attempt는 자동 재시도되지 않으며, 실패하면 stage와 근거를 남긴 뒤 운영자가 rollback, 재시도, 조사를 선택합니다.

## 상태

| 상태 | 의미 | 다음 행동 |
| --- | --- | --- |
| `SUCCESS` | image pull/load, compose start, container health, BFF smoke, post-deploy watch가 통과 | release note 또는 운영 기록에 sanitized summary만 남김 |
| `FAILED_PREFLIGHT` | env file, Docker/Compose, backup, registry 준비 부족 | 배포를 시작하지 않고 준비 조건 복구 |
| `FAILED_DEPLOY` | runtime file install, image pull/load, compose config/up 실패 | compose 상태와 ledger 확인 후 rollback 판단 |
| `FAILED_HEALTH` | `/internal/health`, BFF smoke, OAuth smoke, post-deploy watch 실패 | running image/env/log 조사 또는 이전 image 수동 rollback |
| `USER_ABORTED` | 운영자가 중단 | 중단 stage를 기록하고 수동 정리 |

## Ledger 위치

운영 VM:

```text
/var/log/readmates/deploy-attempts.jsonl
```

권장 권한:

```bash
sudo install -d -o root -g readmates -m 0750 /var/log/readmates
sudo touch /var/log/readmates/deploy-attempts.jsonl
sudo chown root:readmates /var/log/readmates/deploy-attempts.jsonl
sudo chmod 0640 /var/log/readmates/deploy-attempts.jsonl
```

## 이벤트 필드

| 필드 | 설명 | 민감도 |
| --- | --- | --- |
| `attemptId` | 배포 script가 생성한 UTC timestamp 기반 id | 낮음 |
| `event` | `STARTED`, `PREFLIGHT_PASSED`, `IMAGE_RESOLVED`, `STACK_STARTED`, `HEALTH_PASSED`, `BFF_SMOKE_PASSED`, `SUCCESS`, `FAILED` | 낮음 |
| `stage` | 실패 또는 진행 중 stage | 낮음 |
| `at` | UTC ISO-8601 timestamp | 낮음 |
| `image` | `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z` 같은 image reference | 낮음. private repo name이면 외부 공유 금지 |
| `repoDigest` | registry digest. 없으면 생략 | 낮음 |
| `imageId` | Docker image id | 낮음 |
| `exitCode` | 실패 exit code | 낮음 |
| `durationSeconds` | attempt 소요 시간 | 낮음 |

## 금지 필드

Ledger에 아래 값을 넣지 않습니다.

- `/etc/readmates/readmates.env` 내용
- DB host 실제 값, password, OAuth secret, BFF secret, SMTP credential
- cookie, Authorization header, OAuth code, token
- request/response body 전문
- 운영 smoke 결과 전문
- 실제 멤버 이름, 이메일, club 운영 데이터

## 실패 stage별 1차 확인

| Stage | 확인 |
| --- | --- |
| `preflight` | `/etc/readmates/readmates.env` 존재와 권한, 최근 DB backup, VM Docker/Compose, GHCR login |
| `image` | GHCR image tag 존재, registry auth, image architecture |
| `install` | `/opt/readmates`, `/etc/readmates/caddy.env`, `/opt/readmates/.env`, systemd unit 권한 |
| `compose-config` | `sudo docker compose -f /opt/readmates/compose.yml config` |
| `compose-up` | `sudo docker compose -f /opt/readmates/compose.yml ps` |
| `health` | `readmates-api` container logs, `/internal/health`, Flyway migration logs |
| `bff-smoke` | Cloudflare Pages secret, `READMATES_API_BASE_URL`, BFF secret rotation state |
| `post-deploy-watch` | recent `ERROR`, OAuth redirect smoke, public API smoke |

## 수동 rollback 기준

아래 중 하나면 이전 image로 rollback을 검토합니다.

- 새 image container가 health를 통과하지 못한다.
- BFF smoke가 새 서버 API와 맞지 않는다.
- post-deploy watch에서 새로운 5xx 또는 반복 `ERROR`가 발생한다.
- Flyway migration이 실패했고 DB가 안전한 상태로 남아 있다.

Rollback command는 [OCI Compose Stack](../../deploy/compose-stack.md#rollback)을 따른다. 자동 rollback은 수행하지 않는다.
```

- [ ] **Step 2: Verify no forbidden raw values**

Run:

```bash
rg -n "password=|secret=|BEGIN .*PRIVATE KEY|ocid1\\.|@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|/(Users|home)/[A-Za-z0-9._-]+" docs/operations/runbooks/deploy-attempts.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/runbooks/deploy-attempts.md
git commit -m "docs: define deploy attempt model"
```

---

## Task 3: Add Read-Only Diagnostics Runbook

**Files:**

- Create: `docs/operations/runbooks/read-only-diagnostics.md`

- [ ] **Step 1: Create `read-only-diagnostics.md`**

Use this exact content:

```markdown
# Read-only Diagnostics

ReadMates 운영 진단은 가능한 한 읽기 전용 command로 제한합니다. Claude나 다른 자동화 도구에 production 진단을 위임할 때는 client를 신뢰하지 않고, 서버 쪽 OpenSSH `ForceCommand`로 실행 가능 command를 물리적으로 제한합니다.

## 보장하려는 것

- 진단 키로 접속하면 `/usr/local/bin/readmates-collect`만 실행되고 연결이 종료됩니다.
- interactive shell, port forwarding, agent forwarding, X11 forwarding, pty, scp/sftp를 막습니다.
- collector는 secret-bearing env file 내용을 출력하지 않습니다.
- collector는 service restart, Docker mutation, package install, file write를 수행하지 않습니다.

## 보장하지 않는 것

- 배포용 SSH key가 유출된 경우
- VM 자체가 다른 경로로 침해된 경우
- root 권한 사용자가 collector를 악성 script로 바꾼 경우
- 운영자가 일반 SSH 세션에서 destructive command를 직접 실행한 경우

## Collector 설치

```bash
scp -i <deploy-ssh-key> deploy/oci/readmates-collect.sh deploy/oci/install-readmates-collector.sh ubuntu@<vm-public-ip>:/tmp/
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> 'sudo bash /tmp/install-readmates-collector.sh'
```

## ForceCommand 등록

진단 전용 public key를 `authorized_keys`에 아래 형태로 등록합니다. 실제 key 값은 Git에 기록하지 않습니다.

```text
command="/usr/local/bin/readmates-collect",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 <diagnostic-public-key> readmates-diagnostic
```

## 동작 확인

아래 세 명령은 모두 같은 collector 출력만 반환해야 합니다.

```bash
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'whoami'
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'sudo systemctl restart readmates-stack'
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'cat /etc/readmates/readmates.env'
```

명령 문자열은 server-side ForceCommand에 의해 무시되어야 합니다.

## 출력 저장 규칙

Collector 출력은 운영 진단에는 사용할 수 있지만, public repo에는 전문을 저장하지 않습니다. post-mortem이나 release note에는 아래처럼 sanitized summary만 남깁니다.

```text
readmates-collect 실행 결과: readmates-api health는 UP, recent ERROR 0건, disk/memory 정상 범위. 운영 host와 로그 전문은 Git 밖 운영 기록에 보관.
```

## 관련 script

- `deploy/oci/readmates-collect.sh`
- `deploy/oci/install-readmates-collector.sh`
```

- [ ] **Step 2: Verify links and safety**

Run:

```bash
test -f docs/operations/runbooks/read-only-diagnostics.md
rg -n "readmates-collect|ForceCommand|diagnostic-public-key" docs/operations/runbooks/read-only-diagnostics.md
rg -n "BEGIN .*PRIVATE KEY|ocid1\\.|/(Users|home)/[A-Za-z0-9._-]+" docs/operations/runbooks/read-only-diagnostics.md
```

Expected: first two commands print matches; final command prints no output.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/runbooks/read-only-diagnostics.md
git commit -m "docs: add read-only diagnostics runbook"
```

---

## Task 4: Add Post-Deploy Watch Runbook

**Files:**

- Create: `docs/operations/runbooks/post-deploy-watch.md`

- [ ] **Step 1: Create `post-deploy-watch.md`**

Use this exact content:

```markdown
# Post-deploy Watch

Post-deploy watch는 backend compose 배포 직후 5-10분 동안 health, BFF/OAuth smoke, recent log error를 묶어 확인하는 절차입니다. 실패 시 자동 rollback하지 않고 운영자가 판단합니다.

## 기본 실행

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/watch-compose-post-deploy.sh
```

Registered club host를 함께 확인할 때만 아래 값을 추가합니다.

```bash
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host>
```

## 확인 항목

1. VM에서 `readmates-stack` systemd 상태 확인.
2. `/opt/readmates/compose.yml` 기준 `docker compose ps` 확인.
3. `readmates-api` container 내부 `/internal/health` 확인.
4. Cloudflare BFF `/api/bff/api/auth/me` smoke 확인.
5. `scripts/smoke-production-integrations.sh`로 Pages marker와 OAuth redirect URI 확인.
6. 최근 로그에서 `ERROR`, `Exception`, `Caused by` 패턴 확인.

## 실패 판정

- health endpoint가 timeout 또는 non-2xx를 반환한다.
- BFF auth smoke가 network 또는 5xx로 실패한다.
- OAuth redirect smoke에서 기대 auth base URL과 다른 `redirect_uri`가 나온다.
- 새 배포 이후 반복적인 `ERROR` 또는 exception chain이 발생한다.

## 실패 시 행동

1. 같은 watch를 자동 재시도하지 않습니다.
2. `docs/operations/runbooks/deploy-attempts.md`의 실패 stage 기준으로 분류합니다.
3. `deploy/oci/readmates-collect.sh`로 read-only snapshot을 수집합니다.
4. 이전 image rollback 또는 runtime env 조사를 운영자가 선택합니다.

## 결과 기록

공개 문서에는 summary만 남깁니다.

```text
Post-deploy watch: health/BFF/OAuth smoke 통과, recent ERROR 없음. 운영 출력 전문은 Git 밖에 보관.
```
```

- [ ] **Step 2: Verify link targets**

Run:

```bash
test -f scripts/smoke-production-integrations.sh
test -f docs/operations/runbooks/deploy-attempts.md
test -f docs/operations/runbooks/read-only-diagnostics.md
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/runbooks/post-deploy-watch.md
git commit -m "docs: add post-deploy watch runbook"
```

---

## Task 5: Add Read-Only Collector Script

**Files:**

- Create: `deploy/oci/readmates-collect.sh`

- [ ] **Step 1: Create `deploy/oci/readmates-collect.sh`**

Use this exact content:

```bash
#!/usr/bin/env bash
set -uo pipefail

REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
COMPOSE_FILE="${READMATES_COMPOSE_FILE:-${REMOTE_DIR}/compose.yml}"
SERVICE_NAME="${READMATES_STACK_SERVICE:-readmates-stack}"

section() {
  printf '\n===== %s =====\n' "$1"
}

run_or_note() {
  local label="$1"
  shift
  section "$label"
  "$@" 2>&1 || printf '[readmates-collect] command failed: %s\n' "$label"
}

compose_or_note() {
  local label="$1"
  shift
  section "$label"
  if [ ! -f "$COMPOSE_FILE" ]; then
    printf '[readmates-collect] compose file missing: %s\n' "$COMPOSE_FILE"
    return 0
  fi
  sudo docker compose -f "$COMPOSE_FILE" "$@" 2>&1 || printf '[readmates-collect] compose command failed: %s\n' "$label"
}

section "readmates collect metadata"
printf 'Host=%s\n' "$(hostname 2>/dev/null || printf unknown)"
printf 'Date=%s\n' "$(date -Is)"
printf 'Service=%s\n' "$SERVICE_NAME"
printf 'ComposeFile=%s\n' "$COMPOSE_FILE"

run_or_note "uptime" uptime
run_or_note "df -h" df -h
run_or_note "free -m" free -m
run_or_note "vmstat 1 3" vmstat 1 3
run_or_note "systemctl status ${SERVICE_NAME}" systemctl status "$SERVICE_NAME" --no-pager -l

compose_or_note "docker compose ps" ps
compose_or_note "readmates-api logs 10m" logs --since 10m --tail 200 readmates-api
compose_or_note "caddy logs 10m" logs --since 10m --tail 120 caddy

section "readmates-api internal health"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    curl -fsS --max-time 5 http://127.0.0.1:8080/internal/health 2>&1 \
    || printf '[readmates-collect] internal health unavailable\n'
fi

section "readmates-api readiness"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    curl -fsS --max-time 5 http://127.0.0.1:8081/actuator/health/readiness 2>&1 \
    || printf '[readmates-collect] readiness unavailable\n'
fi

section "prometheus metric summary"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" exec -T readmates-api \
    sh -c "curl -fsS --max-time 5 http://127.0.0.1:8081/actuator/prometheus | grep -E '^(http_server_requests_seconds_count|jvm_memory_used_bytes|hikaricp_connections_active|hikaricp_connections_pending|readmates_notifications_outbox_backlog)' | head -80" 2>&1 \
    || printf '[readmates-collect] prometheus summary unavailable\n'
fi

section "recent readmates-api errors"
if [ -f "$COMPOSE_FILE" ]; then
  sudo docker compose -f "$COMPOSE_FILE" logs --since 24h readmates-api 2>/dev/null \
    | grep -E 'ERROR|Exception|Caused by' \
    | tail -80 \
    || printf '[readmates-collect] no recent ERROR/Exception lines found\n'
fi

section "container image summary"
if [ -f "$COMPOSE_FILE" ]; then
  api_container="$(sudo docker compose -f "$COMPOSE_FILE" ps -q readmates-api 2>/dev/null || true)"
  if [ -n "$api_container" ]; then
    sudo docker inspect "$api_container" \
      --format 'Container={{.Name}} ImageId={{.Image}} StartedAt={{.State.StartedAt}} Status={{.State.Status}}' 2>&1 \
      || printf '[readmates-collect] docker inspect failed\n'
  else
    printf '[readmates-collect] readmates-api container not found\n'
  fi
fi

section "collector complete"
```

- [ ] **Step 2: Make script executable**

Run:

```bash
chmod +x deploy/oci/readmates-collect.sh
```

- [ ] **Step 3: Syntax check**

Run:

```bash
bash -n deploy/oci/readmates-collect.sh
```

Expected: no output, exit 0.

- [ ] **Step 4: Safety grep**

Run:

```bash
rg -n "readmates.env|SPRING_DATASOURCE_PASSWORD|READMATES_BFF_SECRET|OAUTH|cat /etc|printenv|env$" deploy/oci/readmates-collect.sh
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add deploy/oci/readmates-collect.sh
git commit -m "ops: add read-only compose diagnostics collector"
```

---

## Task 6: Add Collector Installer

**Files:**

- Create: `deploy/oci/install-readmates-collector.sh`

- [ ] **Step 1: Create `install-readmates-collector.sh`**

Use this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${1:-/tmp/readmates-collect.sh}"
TARGET_PATH="${READMATES_COLLECT_TARGET:-/usr/local/bin/readmates-collect}"

if [ ! -f "$SOURCE_PATH" ]; then
  echo "collector source not found: $SOURCE_PATH" >&2
  exit 1
fi

install -o root -g root -m 0755 "$SOURCE_PATH" "$TARGET_PATH"

echo "Installed $TARGET_PATH"
echo "To use a diagnostic SSH key, add an authorized_keys entry like:"
echo 'command="/usr/local/bin/readmates-collect",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 <diagnostic-public-key> readmates-diagnostic'
```

- [ ] **Step 2: Make script executable and validate**

Run:

```bash
chmod +x deploy/oci/install-readmates-collector.sh
bash -n deploy/oci/install-readmates-collector.sh
```

Expected: no output from `bash -n`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add deploy/oci/install-readmates-collector.sh
git commit -m "ops: add collector installer"
```

---

## Task 7: Add Post-Deploy Watch Script

**Files:**

- Create: `deploy/oci/watch-compose-post-deploy.sh`

- [ ] **Step 1: Create `watch-compose-post-deploy.sh`**

Use this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_DIR="${READMATES_REMOTE_DIR:-/opt/readmates}"
APP_BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$APP_BASE_URL}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

echo "==> [watch] VM compose health"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
sudo systemctl status readmates-stack --no-pager -l >/dev/null
sudo docker compose -f compose.yml ps
sudo docker compose -f compose.yml exec -T readmates-api curl -fsS --max-time 5 http://127.0.0.1:8080/internal/health >/dev/null
EOF

echo "==> [watch] BFF auth smoke"
curl -fsS --max-time 10 "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null

echo "==> [watch] OAuth and Pages marker smoke"
READMATES_SMOKE_BASE_URL="$APP_BASE_URL" \
READMATES_SMOKE_AUTH_BASE_URL="$AUTH_BASE_URL" \
READMATES_SMOKE_CLUB_HOST="${READMATES_SMOKE_CLUB_HOST:-}" \
./scripts/smoke-production-integrations.sh

echo "==> [watch] recent backend errors"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
error_lines="\$(sudo docker compose -f compose.yml logs --since 10m readmates-api 2>/dev/null | grep -E 'ERROR|Exception|Caused by' || true)"
if [ -n "\$error_lines" ]; then
  echo "\$error_lines" | tail -120
  exit 1
fi
EOF

echo "Post-deploy watch passed"
```

- [ ] **Step 2: Make script executable and validate**

Run:

```bash
chmod +x deploy/oci/watch-compose-post-deploy.sh
bash -n deploy/oci/watch-compose-post-deploy.sh
```

Expected: no output from `bash -n`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add deploy/oci/watch-compose-post-deploy.sh
git commit -m "ops: add post-deploy watch script"
```

---

## Task 8: Add Deploy Attempt Ledger Helpers

**Files:**

- Modify: `deploy/oci/05-deploy-compose-stack.sh`

- [ ] **Step 1: Insert variables after existing variable block**

After `REMOTE_DIR="/opt/readmates"`, add:

```bash
ATTEMPT_ID="${READMATES_DEPLOY_ATTEMPT_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
ATTEMPT_STARTED_EPOCH="$(date -u +%s)"
ATTEMPT_STAGE="init"
REMOTE_LEDGER="${READMATES_DEPLOY_LEDGER:-/var/log/readmates/deploy-attempts.jsonl}"
```

- [ ] **Step 2: Add JSON helper functions after `uses_registry_image`**

Add:

```bash
json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  printf '%s' "$value"
}

utc_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

duration_seconds() {
  local now
  now="$(date -u +%s)"
  echo $((now - ATTEMPT_STARTED_EPOCH))
}

remote_ledger_append() {
  local event="$1"
  local status="$2"
  local detail="${3:-}"
  local at duration payload
  at="$(utc_now)"
  duration="$(duration_seconds)"
  payload="{\"attemptId\":\"$(json_escape "$ATTEMPT_ID")\",\"event\":\"$(json_escape "$event")\",\"status\":\"$(json_escape "$status")\",\"stage\":\"$(json_escape "$ATTEMPT_STAGE")\",\"at\":\"$at\",\"durationSeconds\":$duration"
  if [ -n "$detail" ]; then
    payload="${payload},\"detail\":\"$(json_escape "$detail")\""
  fi
  payload="${payload}}"
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "sudo install -d -o root -g readmates -m 0750 /var/log/readmates && sudo touch $(shell_quote "$REMOTE_LEDGER") && sudo chown root:readmates $(shell_quote "$REMOTE_LEDGER") && sudo chmod 0640 $(shell_quote "$REMOTE_LEDGER") && printf '%s\n' $(shell_quote "$payload") | sudo tee -a $(shell_quote "$REMOTE_LEDGER") >/dev/null" \
    || true
}

mark_stage() {
  ATTEMPT_STAGE="$1"
}

on_deploy_error() {
  local exit_code="$?"
  remote_ledger_append "FAILED" "FAILED" "exitCode=${exit_code}"
  exit "$exit_code"
}
```

- [ ] **Step 3: Install trap after `SSH_OPTIONS` is defined**

Add:

```bash
trap on_deploy_error ERR
```

- [ ] **Step 4: Add stage markers and events**

Add these calls at the existing stages:

```bash
mark_stage "preflight"
remote_ledger_append "STARTED" "RUNNING" "image=${IMAGE_TAG}"
```

after required file checks and image source decision:

```bash
remote_ledger_append "PREFLIGHT_PASSED" "RUNNING" "imageSource=${IMAGE_SOURCE}"
```

after image pull/load:

```bash
mark_stage "image"
remote_ledger_append "IMAGE_RESOLVED" "RUNNING" "image=${IMAGE_TAG}"
```

before compose config:

```bash
mark_stage "compose-config"
```

before compose up:

```bash
mark_stage "compose-up"
```

after compose up:

```bash
remote_ledger_append "STACK_STARTED" "RUNNING" "services=compose"
```

before health smoke:

```bash
mark_stage "health"
```

after health smoke:

```bash
remote_ledger_append "HEALTH_PASSED" "RUNNING" "endpoint=/internal/health"
```

after local BFF smoke:

```bash
mark_stage "bff-smoke"
remote_ledger_append "BFF_SMOKE_PASSED" "RUNNING" "path=/api/bff/api/auth/me"
```

at the end:

```bash
mark_stage "complete"
remote_ledger_append "SUCCESS" "SUCCESS" "image=${IMAGE_TAG}"
trap - ERR
```

- [ ] **Step 5: Validate syntax**

Run:

```bash
bash -n deploy/oci/05-deploy-compose-stack.sh
```

Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add deploy/oci/05-deploy-compose-stack.sh
git commit -m "ops: record compose deploy attempts"
```

---

## Task 9: Add Image Verification

**Files:**

- Modify: `deploy/oci/05-deploy-compose-stack.sh`
- Modify: `docs/operations/runbooks/deploy-attempts.md`

- [ ] **Step 1: Add remote image id capture after image pull/load**

After the existing pull/load remote block, add a remote command that writes the expected image id:

```bash
EXPECTED_IMAGE_ID="$(
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "sudo docker image inspect $(shell_quote "$IMAGE_TAG") --format '{{.Id}}'"
)"
remote_ledger_append "IMAGE_ID_RESOLVED" "RUNNING" "imageId=${EXPECTED_IMAGE_ID}"
```

- [ ] **Step 2: Add running container image id verification after compose up**

After `sudo docker compose -f compose.yml ps`, add:

```bash
RUNNING_IMAGE_ID="$(
  ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
    "cd ${REMOTE_DIR} && container=\$(sudo docker compose -f compose.yml ps -q readmates-api) && sudo docker inspect \"\$container\" --format '{{.Image}}'"
)"
if [ "$RUNNING_IMAGE_ID" != "$EXPECTED_IMAGE_ID" ]; then
  echo "Running readmates-api image mismatch: expected ${EXPECTED_IMAGE_ID}, got ${RUNNING_IMAGE_ID}" >&2
  exit 1
fi
remote_ledger_append "IMAGE_VERIFIED" "RUNNING" "imageId=${RUNNING_IMAGE_ID}"
```

- [ ] **Step 3: Document verification**

In `docs/operations/runbooks/deploy-attempts.md`, add this section after "이벤트 필드":

```markdown
## Image verification

릴리즈 배포는 tag 문자열만 믿지 않고 Docker image id를 확인합니다.

1. VM에서 `sudo docker image inspect "$READMATES_SERVER_IMAGE" --format '{{.Id}}'`로 expected image id를 얻습니다.
2. Compose start 후 `readmates-api` container id를 얻습니다.
3. `sudo docker inspect "$container" --format '{{.Image}}'` 값이 expected image id와 같은지 확인합니다.
4. 값이 다르면 배포를 실패로 처리하고 자동 rollback하지 않습니다.
```

- [ ] **Step 4: Validate**

Run:

```bash
bash -n deploy/oci/05-deploy-compose-stack.sh
git diff --check -- deploy/oci/05-deploy-compose-stack.sh docs/operations/runbooks/deploy-attempts.md
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add deploy/oci/05-deploy-compose-stack.sh docs/operations/runbooks/deploy-attempts.md
git commit -m "ops: verify deployed server image"
```

---

## Task 10: Wire Post-Deploy Watch Into Compose Deploy

**Files:**

- Modify: `deploy/oci/05-deploy-compose-stack.sh`
- Modify: `docs/operations/runbooks/post-deploy-watch.md`

- [ ] **Step 1: Add watch toggle variable**

After `REMOTE_DIR="/opt/readmates"`, add:

```bash
READMATES_RUN_POST_DEPLOY_WATCH="${READMATES_RUN_POST_DEPLOY_WATCH:-true}"
```

- [ ] **Step 2: Call watch script after BFF smoke**

After `curl -fsS "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null`, add:

```bash
if [ "$READMATES_RUN_POST_DEPLOY_WATCH" = "true" ]; then
  mark_stage "post-deploy-watch"
  READMATES_SMOKE_BASE_URL="$APP_BASE_URL" \
  READMATES_SMOKE_AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$APP_BASE_URL}" \
  VM_PUBLIC_IP="$VM_PUBLIC_IP" \
  SSH_KEY="$SSH_KEY" \
  REMOTE_USER="$REMOTE_USER" \
  SSH_STRICT_HOST_KEY_CHECKING="$SSH_STRICT_HOST_KEY_CHECKING" \
  ./deploy/oci/watch-compose-post-deploy.sh
  remote_ledger_append "POST_DEPLOY_WATCH_PASSED" "RUNNING" "watch=true"
fi
```

- [ ] **Step 3: Document opt-out**

In `docs/operations/runbooks/post-deploy-watch.md`, add:

```markdown
## 배포 script 통합

`deploy/oci/05-deploy-compose-stack.sh`는 기본적으로 post-deploy watch를 실행합니다. 장애 대응 중 watch를 별도로 수행해야 하면 아래처럼 배포 script의 자동 watch만 끕니다.

```bash
READMATES_RUN_POST_DEPLOY_WATCH=false \
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

watch를 끈 경우 같은 release 작업 안에서 `deploy/oci/watch-compose-post-deploy.sh`를 수동 실행합니다.
```

- [ ] **Step 4: Validate**

Run:

```bash
bash -n deploy/oci/05-deploy-compose-stack.sh deploy/oci/watch-compose-post-deploy.sh
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add deploy/oci/05-deploy-compose-stack.sh docs/operations/runbooks/post-deploy-watch.md
git commit -m "ops: run post-deploy watch from compose deploy"
```

---

## Task 11: Add Shell Script CI Gate

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `scripts` job after permissions/concurrency and before frontend**

Insert this job under `jobs:` before `frontend`:

```yaml
  scripts:
    name: Scripts
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Install shellcheck
        run: sudo apt-get update && sudo apt-get install -y --no-install-recommends shellcheck

      - name: Bash syntax
        run: bash -n scripts/*.sh deploy/oci/*.sh

      - name: ShellCheck
        run: shellcheck scripts/*.sh deploy/oci/*.sh
```

- [ ] **Step 2: Run local syntax check**

Run:

```bash
bash -n scripts/*.sh deploy/oci/*.sh
```

Expected: no output, exit 0.

- [ ] **Step 3: Run shellcheck locally if installed**

Run:

```bash
if command -v shellcheck >/dev/null 2>&1; then shellcheck scripts/*.sh deploy/oci/*.sh; else echo "shellcheck not installed locally"; fi
```

Expected: shellcheck passes, or local environment prints `shellcheck not installed locally`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: validate shell scripts"
```

---

## Task 11A: Add Public Release Safety CI and Failure Artifacts

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `public-release` job**

Insert this job under `jobs:` after the `scripts` job:

```yaml
  public-release:
    name: Public release safety
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Build public release candidate
        run: ./scripts/build-public-release-candidate.sh

      - name: Run public release check
        run: ./scripts/public-release-check.sh .tmp/public-release-candidate
```

Do not upload `.tmp/public-release-candidate` as an artifact. If the scanner ever fails because of an active-secret-looking value, artifact upload could create a second exposure path.

- [ ] **Step 2: Add failure-only test report artifacts**

Use `actions/upload-artifact` pinned to a full commit SHA, not a floating `@v*` tag. Resolve the current SHA at implementation time and add `if-no-files-found: ignore`.

Frontend job failure artifact paths:

```yaml
front/test-results
front/playwright-report
front/coverage
```

Backend job failure artifact paths:

```yaml
server/build/reports/tests
server/build/test-results
```

E2E job failure artifact paths:

```yaml
front/test-results
front/playwright-report
```

Artifact rules:

- `if: failure()`
- no `.env`, `.wrangler`, `.tmp/public-release-candidate`, provider state, smoke output 전문, private host 목록
- artifact names include the job and shard where relevant, for example `e2e-${{ matrix.shard }}-reports`

- [ ] **Step 3: Validate workflow text**

Run:

```bash
git diff --check -- .github/workflows/ci.yml
rg -n "public-release|build-public-release-candidate|public-release-check|upload-artifact" .github/workflows/ci.yml
```

Expected: diff check passes and `rg` prints the new job plus artifact upload steps.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add public release safety checks"
```

---

## Task 11B: Harden Release Tag Workflows

**Files:**

- Modify: `.github/workflows/deploy-front.yml`
- Modify: `.github/workflows/deploy-server.yml`

- [ ] **Step 1: Add production environment boundary**

Add a production environment to both deploy jobs.

For `deploy-front.yml`:

```yaml
    environment:
      name: production
      url: https://readmates.pages.dev
```

For `deploy-server.yml`:

```yaml
    environment:
      name: production
```

GitHub repository settings must separately configure required reviewers and environment secrets. This YAML change creates the workflow boundary; it does not add backend VM SSH deploy credentials.

- [ ] **Step 2: Add frontend release fixture drift check**

In `deploy-front.yml`, after the `Build` step and before `Deploy to Cloudflare Pages`, add:

```yaml
      - name: Check zod fixtures are up to date
        run: |
          pnpm zod:export-fixtures
          git diff --exit-code tests/unit/__fixtures__/zod-schemas/
```

Expected behavior: a release tag cannot deploy the frontend if generated API contract fixtures are stale.

- [ ] **Step 3: Add server test gate before image publish**

In `deploy-server.yml`, replace:

```yaml
      - name: Build server jar
        run: ./server/gradlew -p server bootJar
```

with:

```yaml
      - name: Test and build server jar
        run: ./server/gradlew -p server clean test bootJar
```

Expected behavior: a release tag cannot publish a GHCR server image unless the server test suite passes in the release workflow itself.

- [ ] **Step 4: Add image SBOM and provenance metadata**

In the `docker/build-push-action` step, add:

```yaml
          sbom: true
          provenance: true
```

Keep the existing `platforms: linux/arm64`, `push: true`, and tag calculation.

- [ ] **Step 5: Add image vulnerability scan**

Add an image scan after the build-and-push step. Use a scanner action pinned to a full commit SHA. The scan target is:

```yaml
${{ steps.image.outputs.name }}:${{ steps.image.outputs.tag }}
```

Initial rollout options:

- If the first scan has no HIGH/CRITICAL baseline issues, set the scanner to fail on `HIGH,CRITICAL`.
- If the base image has existing HIGH findings, run report-only in the first PR, document the baseline in the PR body, then switch to fail-on-new HIGH/CRITICAL in a follow-up.

Do not print secrets, environment files, or private host lists in scanner output.

- [ ] **Step 6: Add release workflow failure artifacts**

Use the same pinned `actions/upload-artifact` SHA selected in Task 11A.

`deploy-front.yml` failure artifact paths:

```yaml
front/test-results
front/dist
```

`deploy-server.yml` failure artifact paths:

```yaml
server/build/reports/tests
server/build/test-results
```

Do not upload Docker credentials, `.docker/config.json`, `.env`, Cloudflare state, or release smoke output.

- [ ] **Step 7: Validate workflow text**

Run:

```bash
git diff --check -- .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml
rg -n "environment:|zod:export-fixtures|clean test bootJar|sbom:|provenance:|upload-artifact" .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml
```

Expected: diff check passes and `rg` prints all new release hardening points.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml
git commit -m "ci: harden release deploy workflows"
```

---

## Task 12: Update Deploy and Script Documentation

**Files:**

- Modify: `docs/deploy/compose-stack.md`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `scripts/README.md`

- [ ] **Step 1: Update `docs/deploy/compose-stack.md`**

Add this section after "Deploy":

```markdown
## Deploy attempt ledger

`05-deploy-compose-stack.sh` records sanitized attempt events on the VM at `/var/log/readmates/deploy-attempts.jsonl`. The ledger records stage, status, timestamp, image reference, and image id/digest. It does not record env file contents, cookies, OAuth codes, request/response bodies, raw logs, member data, or provider credentials.

See [Deploy attempts](../operations/runbooks/deploy-attempts.md).
```

Add this section after "Smoke":

```markdown
## Post-deploy watch

The compose deploy script runs `deploy/oci/watch-compose-post-deploy.sh` by default after the BFF auth smoke. This bounded watch checks VM health, Cloudflare BFF auth smoke, OAuth redirect smoke, and recent backend error logs. It does not perform automatic rollback.

See [Post-deploy watch](../operations/runbooks/post-deploy-watch.md).
```

- [ ] **Step 2: Update `docs/deploy/oci-backend.md`**

Add this paragraph after the deploy completion paragraph near the top:

```markdown
운영 진단이 필요하면 [Read-only diagnostics](../operations/runbooks/read-only-diagnostics.md)의 ForceCommand 기반 collector를 사용합니다. Collector 출력 전문은 Git에 저장하지 않고, post-mortem이나 release note에는 sanitized summary만 남깁니다.
```

- [ ] **Step 3: Update `scripts/README.md`**

In the manifest list, ensure `deploy/oci/` remains included and add:

```markdown
`deploy/oci/`에는 compose 배포 script뿐 아니라 read-only diagnostics collector와 post-deploy watch helper도 포함됩니다. 이 script들은 공개 후보 scanner 대상이며 실제 운영 출력이나 state file을 포함하지 않습니다.
```

- [ ] **Step 4: Validate docs**

Run:

```bash
git diff --check -- docs/deploy/compose-stack.md docs/deploy/oci-backend.md scripts/README.md
rg -n "deploy-attempts.md|post-deploy-watch.md|read-only-diagnostics.md" docs/deploy/compose-stack.md docs/deploy/oci-backend.md scripts/README.md
```

Expected: diff check passes and `rg` prints the new links.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy/compose-stack.md docs/deploy/oci-backend.md scripts/README.md
git commit -m "docs: document deploy diagnostics workflow"
```

---

## Task 13: Public Release Candidate Compatibility

**Files:**

- Modify only if needed: `scripts/build-public-release-candidate.sh`
- Modify only if needed: `scripts/public-release-check.sh`

- [ ] **Step 1: Build public release candidate**

Run:

```bash
./scripts/build-public-release-candidate.sh
```

Expected: candidate is created at `.tmp/public-release-candidate`.

- [ ] **Step 2: Check that new files are included**

Run:

```bash
test -f .tmp/public-release-candidate/deploy/oci/readmates-collect.sh
test -f .tmp/public-release-candidate/deploy/oci/install-readmates-collector.sh
test -f .tmp/public-release-candidate/deploy/oci/watch-compose-post-deploy.sh
test -f .tmp/public-release-candidate/docs/operations/runbooks/README.md
```

Expected: all commands exit 0.

- [ ] **Step 3: Run public release check**

Run:

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: pass.

- [ ] **Step 4: Patch candidate scripts only if Step 2 or Step 3 fails for manifest reasons**

If new files are missing because the manifest excludes them, update `scripts/build-public-release-candidate.sh` so the existing `copy_dir "deploy/oci"` and docs allowlist include the new runbook paths. If scanner rejects a real safety issue, remove the unsafe content instead of allowlisting it.

- [ ] **Step 5: Commit if scanner scripts changed**

If Step 4 changed files:

```bash
git add scripts/build-public-release-candidate.sh scripts/public-release-check.sh
git commit -m "scripts: include operations runbooks in public candidate"
```

If Step 4 changed nothing, do not create a commit.

---

## Task 14: Final Verification

**Files:**

- All changed files in this plan.

- [ ] **Step 1: Run docs whitespace check**

Run:

```bash
git diff --check -- .github/workflows/ci.yml .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml docs/operations docs/deploy scripts deploy/oci
```

Expected: no whitespace errors.

- [ ] **Step 2: Run shell syntax**

Run:

```bash
bash -n scripts/*.sh deploy/oci/*.sh
```

Expected: no output, exit 0.

- [ ] **Step 3: Run shellcheck**

Run:

```bash
shellcheck scripts/*.sh deploy/oci/*.sh
```

Expected: pass. If shellcheck is not installed in the local environment, record it as skipped and rely on CI for this check.

- [ ] **Step 4: Run public release candidate checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: both pass.

- [ ] **Step 5: Review release workflow hardening**

Run:

```bash
rg -n "public-release|zod:export-fixtures|clean test bootJar|environment:|sbom:|provenance:" .github/workflows/ci.yml .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml
```

Expected: matches for public release CI, frontend fixture drift, server release test gate, production environment boundary, and image metadata.

- [ ] **Step 6: Review changed docs for forbidden operational values**

Run:

```bash
rg -n "BEGIN .*PRIVATE KEY|ocid1\\.|/(Users|home)/[A-Za-z0-9._-]+|SPRING_DATASOURCE_PASSWORD=.*[^<]|READMATES_BFF_SECRET=.*[^<]|[A-Za-z0-9._%+-]+@gmail\\.com" docs/operations docs/deploy scripts/README.md deploy/oci
```

Expected: no output for newly added content. Existing placeholder lines with `<db-password>` or `<shared-bff-secret>` are acceptable.

- [ ] **Step 7: Final commit**

If previous tasks were committed task-by-task, create no extra commit. If the work was batched, commit all remaining changes:

```bash
git add .github/workflows/ci.yml .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml docs/operations docs/deploy scripts deploy/oci
git commit -m "ops: adopt safer deployment diagnostics workflow"
```

---

## Self-Review Checklist

- [ ] Spec requirement "runbook directory" maps to Tasks 1-4 and 12.
- [ ] Spec requirement "read-only diagnostics collector" maps to Tasks 3, 5, and 6.
- [ ] Spec requirement "deploy attempt ledger" maps to Tasks 2 and 8.
- [ ] Spec requirement "image digest/id verification" maps to Task 9.
- [ ] Spec requirement "post-deploy watch" maps to Tasks 4, 7, and 10.
- [ ] Spec requirement "shell script CI gate" maps to Task 11.
- [ ] Spec requirement "public release safety CI" maps to Task 11A.
- [ ] Spec requirement "release tag workflow hardening" maps to Task 11B.
- [ ] Spec requirement "public release safety" maps to Tasks 12-14.
- [ ] No frontend/server application code is modified.
- [ ] No real operational values are introduced.
