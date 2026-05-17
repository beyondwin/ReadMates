# Deploy Secrets via GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 시크릿/설정을 SSH 편집이 아닌 GitHub Actions workflow로 관리하고, 로컬 개발이 운영과 동일한 docker compose 메커니즘으로 동작하도록 한다.

**Architecture:** GitHub Repository Secrets/Variables를 single source로 두고, `workflow_dispatch` 워크플로가 (1) 시크릿 존재 검증, (2) umask 077 heredoc으로 env 파일 렌더링, (3) 전용 ed25519 deploy key로 scp/ssh를 통한 atomic write를 수행. `02-configure.sh` 는 인프라 셋업만 담당. 로컬은 `compose.override.yml` + `.env` 로 동일한 스택을 띄움.

**Tech Stack:** GitHub Actions (workflow_dispatch + environment protection), bash + ssh/scp/install, Docker Compose, OCI Ubuntu VM with sshd + fail2ban.

**Spec:** `docs/superpowers/specs/2026-05-17-deploy-secrets-via-github-actions-design.md`

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `docs/operations/runbooks/vm-deploy-key-bootstrap.md` | 1회성 deploy key + sudoers + 비표준 포트 셋업 절차 | 신규 |
| `docs/operations/runbooks/secrets-management.md` | 시크릿 추가/회전 4-step 절차 (SSH 0회) | 신규 |
| `.env.example` | 각 키마다 "LOCAL ONLY" 혹은 "PROD via Secret/Variable" 주석 | 수정 |
| `deploy/local/compose.override.yml` | 로컬에서 OCI compose.yml을 재사용하면서 포트/이미지/볼륨 override | 신규 |
| `.github/workflows/sync-config.yml` | workflow_dispatch로 readmates.env 동기화 + 선택적 재시작 | 신규 |
| `deploy/oci/02-configure.sh` | 시크릿 작성 블록 + 레거시 systemd 블록 제거, 인프라 셋업만 유지 | 수정 |
| `CHANGELOG.md` | unreleased 섹션에 변경 요약 | 수정 |

순서는 **저위험 → 고위험** + **문서 우선**: 운영 인프라가 바뀌기 전에 runbook이 먼저 존재해야 사람이 따라 셋업할 수 있다.

---

### Task 1: VM Deploy Key Bootstrap Runbook

**Files:**
- Create: `docs/operations/runbooks/vm-deploy-key-bootstrap.md`

- [ ] **Step 1: 파일 생성 — 1회성 부트스트랩 절차 11단계 작성**

```markdown
# VM Deploy Key Bootstrap

> **언제:** 신규 OCI VM에 GitHub Actions sync-config 워크플로를 처음 연결할 때 1회 수행.
> **소요:** ~20분.
> **선결 조건:** 기존 admin SSH 접근권한 보유 (`~/.ssh/readmates_oci` 등).

## 절차

### 1. 로컬에서 deploy 전용 ed25519 키 페어 생성

```bash
cd /tmp
ssh-keygen -t ed25519 -C "github-actions-deploy@readmates" -f ./readmates-deploy -N ""
```

생성된 `readmates-deploy` (private), `readmates-deploy.pub` (public) 두 파일.

#### 2. VM에 `deploy` 유저 생성 (없으면)

```bash
ssh ubuntu@<vm-host> "sudo adduser --disabled-password --gecos '' deploy"
```

#### 3. pubkey를 deploy 유저 authorized_keys 에 등록

```bash
cat /tmp/readmates-deploy.pub | ssh ubuntu@<vm-host> "sudo tee -a /home/deploy/.ssh/authorized_keys >/dev/null && sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys"
```

#### 4. `/etc/readmates/` 디렉토리 권한

```bash
ssh ubuntu@<vm-host> "sudo mkdir -p /etc/readmates && sudo chown deploy:deploy /etc/readmates && sudo chmod 750 /etc/readmates"
```

#### 5. sudoers 작성 (4개 명령에만 NOPASSWD)

```bash
ssh ubuntu@<vm-host> "sudo tee /etc/sudoers.d/readmates-deploy >/dev/null" <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/install -m 600 -o deploy /home/deploy/readmates.env.new /etc/readmates/readmates.env
deploy ALL=(root) NOPASSWD: /usr/bin/install -m 600 -o deploy /etc/readmates/readmates.env.bak /etc/readmates/readmates.env
deploy ALL=(root) NOPASSWD: /usr/bin/cp /etc/readmates/readmates.env /etc/readmates/readmates.env.bak
deploy ALL=(root) NOPASSWD: /usr/bin/docker compose -f /opt/readmates/compose.yml *
EOF
ssh ubuntu@<vm-host> "sudo chmod 440 /etc/sudoers.d/readmates-deploy && sudo visudo -c -f /etc/sudoers.d/readmates-deploy"
```

마지막 `visudo -c` 가 `parsed OK` 출력하는지 확인.

#### 6. sshd 비표준 포트 + 비밀번호 인증 비활성화

```bash
ssh ubuntu@<vm-host> "sudo tee /etc/ssh/sshd_config.d/99-readmates.conf >/dev/null" <<'EOF'
Port 2222
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers deploy ubuntu
EOF
```

**중요:** OCI security list에서 포트 2222 inbound (0.0.0.0/0) 먼저 허용. 그 후:

```bash
ssh ubuntu@<vm-host> "sudo sshd -t && sudo systemctl reload ssh"
```

**검증 (기존 22 세션 유지한 채로 새 세션 열기):**

```bash
ssh -p 2222 -i /tmp/readmates-deploy deploy@<vm-host> 'whoami && id'
# 기대 출력: deploy
```

성공 확인 후 OCI security list에서 기존 포트 22 inbound 제거 (admin 키만 별도 IP 제한으로 유지하거나 같은 2222로 통일).

#### 7. fail2ban sshd jail 활성화 확인

```bash
ssh -p 2222 -i /tmp/readmates-deploy deploy@<vm-host> "sudo systemctl status fail2ban && sudo fail2ban-client status sshd"
```

`jail list` 에 `sshd` 가 있고 `Currently failed: 0` 이면 OK.
없으면:

```bash
ssh ubuntu@<vm-host> "sudo apt-get install -y fail2ban && sudo systemctl enable --now fail2ban"
```

#### 8. known_hosts 라인 수집

```bash
ssh-keyscan -p 2222 -t ed25519 <vm-host>
```

출력 첫 줄을 클립보드에 복사.

#### 9. GitHub Repository Secrets/Variables 등록

GitHub Repo → **Settings → Secrets and variables → Actions**:

**Secrets (Repository secrets 탭):**
- `READMATES_DEPLOY_SSH_KEY` ← `cat /tmp/readmates-deploy` (private key 전체 내용)
- `READMATES_VM_KNOWN_HOSTS` ← Step 8 출력

**Variables (Variables 탭):**
- `READMATES_VM_HOST` = `<vm-host>` (예: `api.example.com` 또는 public IP)
- `READMATES_VM_USER` = `deploy`
- `READMATES_VM_SSH_PORT` = `2222`
- `READMATES_DEPLOY_ROOT` = `/opt/readmates`

#### 10. 로컬 임시 키 파일 안전 삭제

```bash
shred -u /tmp/readmates-deploy /tmp/readmates-deploy.pub
```

(`shred` 없는 macOS에서는 `rm -P` 사용.)

#### 11. sync-config 워크플로 1회 실행해 readmates.env 초기 배포

GitHub Actions 탭 → **sync-config** → Run workflow → input: `restart_api=true` → Run.

`production` environment 승인 → 워크플로 성공 후:

```bash
ssh -p 2222 -i ~/.ssh/<admin-key> ubuntu@<vm-host> "sudo ls -la /etc/readmates/readmates.env && sudo head -3 /etc/readmates/readmates.env"
```

기대: `-rw------- 1 deploy deploy ...`, 첫 줄 `# generated by sync-config.yml run=... actor=... at=...`.

`curl https://api.<domain>/actuator/health` → `{"status":"UP"}`.

#### 비상 복구

deploy 키 분실/손상 시:
1. 새 ed25519 키 페어 생성
2. VM에서 기존 `authorized_keys` 라인 제거 + 새 pubkey 추가
3. GitHub `READMATES_DEPLOY_SSH_KEY` 시크릿 교체

sudoers 실수로 잠겼을 때:
- ubuntu 유저로 ssh 접속해 `sudo visudo -f /etc/sudoers.d/readmates-deploy` 수정.

#### 보안 체크리스트

- [ ] private key (`/tmp/readmates-deploy`) 가 로컬에 남아있지 않다 (`shred -u` 완료)
- [ ] private key 가 git history에 들어가 있지 않다 (`git log -p | grep -i 'BEGIN OPENSSH'` 결과 없음)
- [ ] `PasswordAuthentication no` 가 sshd 에 적용되어 있다
- [ ] `/etc/sudoers.d/readmates-deploy` 가 chmod 440 + visudo 통과
- [ ] fail2ban sshd jail 활성
- [ ] OCI security list 포트 2222 inbound 만 열려 있고 22는 닫혀 있다 (또는 admin IP allowlist)
```
```

- [ ] **Step 2: 파일 lint 검증 — 마크다운 깨짐 없는지 확인**

Run: `head -5 docs/operations/runbooks/vm-deploy-key-bootstrap.md && wc -l docs/operations/runbooks/vm-deploy-key-bootstrap.md`
Expected: 첫 5줄 정상 + 100줄 이상.

- [ ] **Step 3: 커밋**

```bash
git add docs/operations/runbooks/vm-deploy-key-bootstrap.md
git commit -m "docs(deploy): add VM deploy key bootstrap runbook

One-time procedure to provision the dedicated ed25519 deploy key,
restricted sudoers, non-standard sshd port, and GitHub Secrets/Variables
required for the sync-config workflow."
```

---

### Task 2: Secrets Management Runbook

**Files:**
- Create: `docs/operations/runbooks/secrets-management.md`

- [ ] **Step 1: 파일 생성 — 4-step 절차 + 시크릿 인벤토리**

```markdown
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

| 키 | 타입 | 비고 |
|---|---|---|
| `READMATES_VM_HOST` | Variable | VM 호스트명 |
| `READMATES_VM_USER` | Variable | `deploy` |
| `READMATES_VM_SSH_PORT` | Variable | `2222` |
| `READMATES_DEPLOY_ROOT` | Variable | `/opt/readmates` |
| `READMATES_APP_BASE_URL` | Variable | `https://readmates.pages.dev` 등 |
| `READMATES_AUTH_BASE_URL` | Variable | 동일 |
| `READMATES_ALLOWED_ORIGINS` | Variable | 콤마 구분 |
| `READMATES_BFF_SECRET_REQUIRED` | Variable | `true` |
| `READMATES_AUTH_SESSION_COOKIE_SECURE` | Variable | `true` |
| `READMATES_AIGEN_ENABLED` | Variable | `true`/`false` |
| `READMATES_AIGEN_ENABLED_PROVIDERS` | Variable | `OPENAI` 등 |
| `READMATES_AIGEN_FALLBACK_DEFAULT_MODEL` | Variable | `gpt-5.4-mini` |
| `CADDY_SITE` | Variable | `api.example.com` |
| `READMATES_SERVER_IMAGE` | Variable | GHCR image ref |

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
```
```

- [ ] **Step 2: 커밋**

```bash
git add docs/operations/runbooks/secrets-management.md
git commit -m "docs(deploy): add secrets management runbook

4-step add/rotate procedure with no SSH, full secret/variable
inventory, rotation cadence guidance, and emergency recovery steps."
```

---

### Task 3: `.env.example` Annotations

**Files:**
- Modify: `/Users/kws/source/web/ReadMates/.env.example`

- [ ] **Step 1: 각 섹션 헤더에 출처 표기 추가 + 키 마다 (LOCAL/SECRET/VARIABLE) 주석**

기존 파일은 이미 섹션화되어 있으므로, 각 섹션 끝에 한 줄 출처 주석만 추가 (값은 그대로 유지). 다음 패치를 적용:

```bash
# 정확한 라인 수정 (Edit tool 권장):
```

수정 위치:

1. 섹션 1) Spring server — 헤더 바로 아래 한 줄 추가:
   ```
   # 출처: prod 는 GitHub Secrets (SPRING_DATASOURCE_*); 로컬은 compose.override.yml 의 mysql 컨테이너와 매칭.
   ```

2. 섹션 2) Auth & BFF — 헤더 아래:
   ```
   # 출처: 모든 *_SECRET 은 GitHub Secrets, base URL/origin/secure 토글은 GitHub Variables.
   ```

3. 섹션 3) Frontend / Cloudflare Pages — 헤더 아래:
   ```
   # 출처: 프론트는 Cloudflare Pages env (deploy-front.yml) 가 관리. 이 파일에는 참고용으로만.
   ```

4. 섹션 4) Local MySQL — 헤더 아래:
   ```
   # 출처: LOCAL ONLY — 운영은 OCI MySQL 서비스를 사용, GitHub Secrets에 SPRING_DATASOURCE_* 등록.
   ```

5. 섹션 5) Redis — 헤더 아래:
   ```
   # 출처: 로컬은 compose 의 redis 컨테이너. 운영 토글은 GitHub Variables.
   ```

6. 섹션 6) Kafka & Notifications — 헤더 아래:
   ```
   # 출처: 토글/토픽명은 GitHub Variables. SMTP 자격증명은 섹션 8) 참고.
   ```

7. 섹션 7) AI 세션 생성 — 헤더 아래:
   ```
   # 출처: API 키 3종은 GitHub Secrets (READMATES_AIGEN_*_API_KEY). 토글/모델명은 GitHub Variables.
   ```

8. 섹션 8) SMTP — 헤더 아래:
   ```
   # 출처: USERNAME/PASSWORD 는 GitHub Secrets, 호스트/포트는 GitHub Variables.
   ```

9. 섹션 9) OCI Compose stack — 헤더 아래:
   ```
   # 출처: GitHub Variables (CADDY_SITE, READMATES_SERVER_IMAGE).
   ```

10. 섹션 10) Legacy / rollback — 헤더 완전히 교체:
    ```
    # ----- 10) (deprecated) Legacy host JAR mode -----
    # 더 이상 사용하지 않습니다. compose stack 만 운영.
    ```

- [ ] **Step 2: diff 검증**

Run: `git diff .env.example | head -80`
Expected: 추가만 (`+` 라인) + 섹션 10 헤더 교체. 시크릿 값 변경 없음.

- [ ] **Step 3: 커밋**

```bash
git add .env.example
git commit -m "docs(env): annotate each section with secret/variable origin

Each section now records whether its values come from local files only,
GitHub Secrets, or GitHub Variables — so future-me knows where to look
when something needs adding or rotating."
```

---

### Task 4: Local Compose Override

**Files:**
- Create: `deploy/local/compose.override.yml`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p deploy/local
```

- [ ] **Step 2: override 파일 작성**

내용:

```yaml
# compose.override.yml — 로컬 prod-parity 개발용 override.
# 사용:
#   cp .env.example .env  &&  편집
#   docker compose -f deploy/oci/compose.yml -f deploy/local/compose.override.yml --env-file .env up
#
# 주의: 운영(VM)에서는 이 파일을 사용하지 않는다. 운영은 compose.yml + env_file 만으로 동작.

services:
  readmates-api:
    ports:
      - "8080:8080"
    environment:
      SPRING_PROFILES_ACTIVE: dev
    volumes:
      - ./logs/readmates-api:/var/log/readmates

  mysql:
    image: mysql:8.4
    restart: unless-stopped
    command:
      - --default-authentication-plugin=mysql_native_password
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    ports:
      - "${READMATES_LOCAL_MYSQL_PORT:-3306}:3306"
    environment:
      MYSQL_ROOT_PASSWORD: ${READMATES_LOCAL_MYSQL_ROOT_PASSWORD:?READMATES_LOCAL_MYSQL_ROOT_PASSWORD 필요}
      MYSQL_DATABASE: ${READMATES_LOCAL_MYSQL_DATABASE:-readmates}
      MYSQL_USER: ${READMATES_LOCAL_MYSQL_USERNAME:-readmates}
      MYSQL_PASSWORD: ${READMATES_LOCAL_MYSQL_PASSWORD:-readmates}
    volumes:
      - readmates-local-mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    ports:
      - "6379:6379"

volumes:
  readmates-local-mysql:
```

- [ ] **Step 3: deploy/oci/compose.yml 에서 mysql 서비스 정의 확인 — 없으면 base의 한계 명시**

```bash
grep -n "^\s*mysql:" deploy/oci/compose.yml || echo "mysql not in base compose — override adds it"
```

운영 compose가 mysql 서비스를 정의하지 않더라도 (운영 DB는 OCI MySQL 서비스 사용), override 의 `services.mysql:` 블록은 새로운 서비스로 추가됨 (docker compose merge 규칙). 이는 의도적 — 로컬에서만 mysql 컨테이너를 추가로 띄움.

- [ ] **Step 4: 로컬 dry-validate (실제 up 하지 않음)**

```bash
cd /Users/kws/source/web/ReadMates && docker compose -f deploy/oci/compose.yml -f deploy/local/compose.override.yml --env-file .env config >/dev/null
```

Expected: exit 0 (구문 OK). 만약 .env 가 비어있어 변수 누락 에러가 나면, `.env` 를 `cp .env.example .env` 로 채우고 다시 시도.

- [ ] **Step 5: 커밋**

```bash
git add deploy/local/compose.override.yml
git commit -m "feat(deploy): add local compose override for prod-parity dev

Lets local dev run the same compose.yml as production with a thin
override layer that exposes ports, swaps in a local mysql container,
and points logs to ./logs. Eliminates the 'works on my machine' gap
caused by using a different stack locally vs. on the VM."
```

---

### Task 5: sync-config GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/sync-config.yml`

- [ ] **Step 1: 워크플로 파일 작성**

내용:

```yaml
name: sync-config

on:
  workflow_dispatch:
    inputs:
      restart_api:
        description: "동기화 후 readmates-api 컨테이너를 재시작"
        type: boolean
        default: false
      dry_run:
        description: "env 파일 렌더링만 (scp/ssh 안 함)"
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: sync-config
  cancel-in-progress: false

jobs:
  sync:
    name: Sync readmates.env to VM
    runs-on: ubuntu-latest
    environment:
      name: production
    env:
      # ----- 인프라 (Variables) -----
      VM_HOST: ${{ vars.READMATES_VM_HOST }}
      VM_USER: ${{ vars.READMATES_VM_USER }}
      VM_PORT: ${{ vars.READMATES_VM_SSH_PORT }}
      DEPLOY_ROOT: ${{ vars.READMATES_DEPLOY_ROOT }}
      # ----- 앱 Variables (비민감 설정) -----
      READMATES_APP_BASE_URL: ${{ vars.READMATES_APP_BASE_URL }}
      READMATES_AUTH_BASE_URL: ${{ vars.READMATES_AUTH_BASE_URL }}
      READMATES_ALLOWED_ORIGINS: ${{ vars.READMATES_ALLOWED_ORIGINS }}
      READMATES_BFF_SECRET_REQUIRED: ${{ vars.READMATES_BFF_SECRET_REQUIRED }}
      READMATES_AUTH_SESSION_COOKIE_SECURE: ${{ vars.READMATES_AUTH_SESSION_COOKIE_SECURE }}
      READMATES_AIGEN_ENABLED: ${{ vars.READMATES_AIGEN_ENABLED }}
      READMATES_AIGEN_ENABLED_PROVIDERS: ${{ vars.READMATES_AIGEN_ENABLED_PROVIDERS }}
      READMATES_AIGEN_FALLBACK_DEFAULT_MODEL: ${{ vars.READMATES_AIGEN_FALLBACK_DEFAULT_MODEL }}
      # ----- 앱 Secrets (민감) -----
      SPRING_PROFILES_ACTIVE: prod
      SPRING_DATASOURCE_URL: ${{ secrets.SPRING_DATASOURCE_URL }}
      SPRING_DATASOURCE_USERNAME: ${{ secrets.SPRING_DATASOURCE_USERNAME }}
      SPRING_DATASOURCE_PASSWORD: ${{ secrets.SPRING_DATASOURCE_PASSWORD }}
      READMATES_AUTH_RETURN_STATE_SECRET: ${{ secrets.READMATES_AUTH_RETURN_STATE_SECRET }}
      READMATES_BFF_SECRET: ${{ secrets.READMATES_BFF_SECRET }}
      READMATES_BFF_SECRETS: ${{ secrets.READMATES_BFF_SECRETS }}
      READMATES_IP_HASH_BASE_SECRET: ${{ secrets.READMATES_IP_HASH_BASE_SECRET }}
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID: ${{ secrets.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID }}
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET: ${{ secrets.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET }}
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE: openid,email,profile
      READMATES_AIGEN_OPENAI_API_KEY: ${{ secrets.READMATES_AIGEN_OPENAI_API_KEY }}
      READMATES_AIGEN_ANTHROPIC_API_KEY: ${{ secrets.READMATES_AIGEN_ANTHROPIC_API_KEY }}
      READMATES_AIGEN_GEMINI_API_KEY: ${{ secrets.READMATES_AIGEN_GEMINI_API_KEY }}
      SPRING_MAIL_USERNAME: ${{ secrets.SPRING_MAIL_USERNAME }}
      SPRING_MAIL_PASSWORD: ${{ secrets.SPRING_MAIL_PASSWORD }}

    steps:
      - name: Assert required secrets present
        # 값을 절대 echo 하지 않는다 — boolean 존재 여부만 출력.
        run: |
          set -u
          missing=()
          required=(
            SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD
            READMATES_AUTH_RETURN_STATE_SECRET READMATES_BFF_SECRET READMATES_IP_HASH_BASE_SECRET
            SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
            SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
            VM_HOST VM_USER VM_PORT DEPLOY_ROOT
            READMATES_APP_BASE_URL READMATES_AUTH_BASE_URL READMATES_ALLOWED_ORIGINS
          )
          for k in "${required[@]}"; do
            v="${!k:-}"
            if [ -z "$v" ]; then
              missing+=("$k")
            fi
          done
          if [ ${#missing[@]} -gt 0 ]; then
            echo "::error::Missing required secrets/variables: ${missing[*]}"
            exit 1
          fi
          echo "All required secrets present."

      - name: Render readmates.env (umask 077, no echo)
        run: |
          set -u
          umask 077
          out="${RUNNER_TEMP}/readmates.env"
          ts="$(date -u +%FT%TZ)"
          {
            printf '# generated by sync-config.yml run=%s sha=%s actor=%s at=%s\n' \
              "$GITHUB_RUN_ID" "$GITHUB_SHA" "$GITHUB_ACTOR" "$ts"
            printf 'SPRING_PROFILES_ACTIVE=%s\n' "$SPRING_PROFILES_ACTIVE"
            printf 'SPRING_DATASOURCE_URL=%s\n' "$SPRING_DATASOURCE_URL"
            printf 'SPRING_DATASOURCE_USERNAME=%s\n' "$SPRING_DATASOURCE_USERNAME"
            printf 'SPRING_DATASOURCE_PASSWORD=%s\n' "$SPRING_DATASOURCE_PASSWORD"
            printf 'READMATES_APP_BASE_URL=%s\n' "$READMATES_APP_BASE_URL"
            printf 'READMATES_AUTH_BASE_URL=%s\n' "$READMATES_AUTH_BASE_URL"
            printf 'READMATES_AUTH_RETURN_STATE_SECRET=%s\n' "$READMATES_AUTH_RETURN_STATE_SECRET"
            printf 'READMATES_ALLOWED_ORIGINS=%s\n' "$READMATES_ALLOWED_ORIGINS"
            printf 'READMATES_BFF_SECRET=%s\n' "$READMATES_BFF_SECRET"
            printf 'READMATES_BFF_SECRETS=%s\n' "$READMATES_BFF_SECRETS"
            printf 'READMATES_BFF_SECRET_REQUIRED=%s\n' "$READMATES_BFF_SECRET_REQUIRED"
            printf 'READMATES_AUTH_SESSION_COOKIE_SECURE=%s\n' "$READMATES_AUTH_SESSION_COOKIE_SECURE"
            printf 'READMATES_IP_HASH_BASE_SECRET=%s\n' "$READMATES_IP_HASH_BASE_SECRET"
            printf 'SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=%s\n' "$SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID"
            printf 'SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=%s\n' "$SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET"
            printf 'SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=%s\n' "$SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE"
            printf 'READMATES_AIGEN_ENABLED=%s\n' "$READMATES_AIGEN_ENABLED"
            printf 'READMATES_AIGEN_ENABLED_PROVIDERS=%s\n' "$READMATES_AIGEN_ENABLED_PROVIDERS"
            printf 'READMATES_AIGEN_FALLBACK_DEFAULT_MODEL=%s\n' "$READMATES_AIGEN_FALLBACK_DEFAULT_MODEL"
            printf 'READMATES_AIGEN_OPENAI_API_KEY=%s\n' "$READMATES_AIGEN_OPENAI_API_KEY"
            printf 'READMATES_AIGEN_ANTHROPIC_API_KEY=%s\n' "$READMATES_AIGEN_ANTHROPIC_API_KEY"
            printf 'READMATES_AIGEN_GEMINI_API_KEY=%s\n' "$READMATES_AIGEN_GEMINI_API_KEY"
            printf 'SPRING_MAIL_USERNAME=%s\n' "$SPRING_MAIL_USERNAME"
            printf 'SPRING_MAIL_PASSWORD=%s\n' "$SPRING_MAIL_PASSWORD"
          } > "$out"
          lines=$(wc -l < "$out")
          checksum=$(sha256sum "$out" | awk '{print $1}')
          echo "rendered=${out}  lines=${lines}  sha256=${checksum}"

      - name: Stop (dry run)
        if: ${{ inputs.dry_run }}
        run: |
          echo "::notice::dry_run=true → SSH/scp 단계 건너뜀."
          exit 0

      - name: Setup SSH agent + known_hosts
        if: ${{ !inputs.dry_run }}
        env:
          DEPLOY_SSH_KEY: ${{ secrets.READMATES_DEPLOY_SSH_KEY }}
          VM_KNOWN_HOSTS: ${{ secrets.READMATES_VM_KNOWN_HOSTS }}
        run: |
          set -u
          umask 077
          mkdir -p ~/.ssh
          printf '%s\n' "$VM_KNOWN_HOSTS" > ~/.ssh/known_hosts
          eval "$(ssh-agent -s)" >/dev/null
          # ssh-add 는 stdin 으로 키를 받음 — 파일을 디스크에 쓰지 않음.
          printf '%s\n' "$DEPLOY_SSH_KEY" | ssh-add - >/dev/null
          # agent socket 을 다음 step 에 전달.
          echo "SSH_AUTH_SOCK=$SSH_AUTH_SOCK" >> "$GITHUB_ENV"
          echo "SSH_AGENT_PID=$SSH_AGENT_PID" >> "$GITHUB_ENV"

      - name: Backup current readmates.env on VM
        if: ${{ !inputs.dry_run }}
        run: |
          ssh -p "$VM_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes \
            "${VM_USER}@${VM_HOST}" \
            'sudo /usr/bin/cp /etc/readmates/readmates.env /etc/readmates/readmates.env.bak 2>/dev/null || true'

      - name: Upload new readmates.env via scp
        if: ${{ !inputs.dry_run }}
        run: |
          scp -P "$VM_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes \
            "${RUNNER_TEMP}/readmates.env" \
            "${VM_USER}@${VM_HOST}:/home/${VM_USER}/readmates.env.new"

      - name: Atomic install on VM
        if: ${{ !inputs.dry_run }}
        run: |
          ssh -p "$VM_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes \
            "${VM_USER}@${VM_HOST}" \
            "sudo /usr/bin/install -m 600 -o ${VM_USER} /home/${VM_USER}/readmates.env.new /etc/readmates/readmates.env && rm -f /home/${VM_USER}/readmates.env.new"

      - name: Restart readmates-api (optional)
        if: ${{ !inputs.dry_run && inputs.restart_api }}
        id: restart
        continue-on-error: true
        run: |
          ssh -p "$VM_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes \
            "${VM_USER}@${VM_HOST}" \
            "sudo /usr/bin/docker compose -f ${DEPLOY_ROOT}/compose.yml up -d --force-recreate readmates-api"

      - name: Rollback on restart failure
        if: ${{ !inputs.dry_run && inputs.restart_api && steps.restart.outcome == 'failure' }}
        run: |
          echo "::error::readmates-api restart 실패 — readmates.env.bak 로 복원 시도"
          ssh -p "$VM_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes \
            "${VM_USER}@${VM_HOST}" \
            "sudo /usr/bin/install -m 600 -o ${VM_USER} /etc/readmates/readmates.env.bak /etc/readmates/readmates.env && sudo /usr/bin/docker compose -f ${DEPLOY_ROOT}/compose.yml up -d --force-recreate readmates-api"
          exit 1

      - name: Cleanup local env file
        if: ${{ always() }}
        run: |
          rm -f "${RUNNER_TEMP}/readmates.env" || true
```

- [ ] **Step 2: actionlint 로 정적 검증**

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color
```

Expected: 에러 없음. (없으면 `brew install actionlint` 후 `actionlint .github/workflows/sync-config.yml`.)

- [ ] **Step 3: 시크릿 echo 패턴 grep — 안전성 회귀 방지**

```bash
grep -nE 'echo[[:space:]]+"?\$(SPRING_|READMATES_|GOOGLE_)' .github/workflows/sync-config.yml; echo "exit=$?"
```

Expected: `exit=1` (no matches). 일치 라인이 있으면 즉시 수정.

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/sync-config.yml
git commit -m "feat(deploy): add sync-config workflow for secrets push

Manual-dispatch workflow that materializes readmates.env from GitHub
Secrets/Variables and atomically installs it on the OCI VM (chmod 600,
owned by deploy user). Validates required secrets up front, never
echoes secret values, uses ssh-agent + pinned known_hosts, and rolls
back to .bak on restart failure. Lets us add or rotate any secret with
zero SSH."
```

---

### Task 6: 02-configure.sh Refactor

**Files:**
- Modify: `/Users/kws/source/web/ReadMates/deploy/oci/02-configure.sh`

- [ ] **Step 1: 전체 재작성 — 인프라 셋업만 유지**

새 내용:

```bash
#!/usr/bin/env bash
# 02-configure.sh — VM 인프라 셋업 (디렉토리, Caddy).
# 시크릿/환경변수는 GitHub Actions 의 sync-config 워크플로가 관리.
#
# 실행:
#   ssh -i ~/.ssh/<admin-key> ubuntu@<vm-host> 'bash -s' < deploy/oci/02-configure.sh
#
# 필요 환경변수:
#   CADDY_SITE  (예: api.example.com)

set -euo pipefail

: "${CADDY_SITE:?CADDY_SITE 환경변수가 필요합니다 (예: CADDY_SITE=api.example.com)}"

case "$CADDY_SITE" in
  :*|http://*|http:*)
    echo "❌ CADDY_SITE는 운영 HTTPS 사이트 주소여야 합니다. 현재 값: ${CADDY_SITE}" >&2
    echo "   예: CADDY_SITE=api.example.com 또는 CADDY_SITE=https://api.example.com" >&2
    exit 1
    ;;
esac

echo "==> [1/3] /etc/readmates 디렉토리 (deploy 유저 소유, 750)"
sudo mkdir -p /etc/readmates
if id -u deploy >/dev/null 2>&1; then
  sudo chown deploy:deploy /etc/readmates
  sudo chmod 750 /etc/readmates
  if [ ! -f /etc/readmates/readmates.env ]; then
    echo "   ⚠️  /etc/readmates/readmates.env 가 아직 없습니다."
    echo "      → GitHub Actions 의 'sync-config' 워크플로를 먼저 실행하세요."
    echo "      → vm-deploy-key-bootstrap.md runbook 참고."
  fi
else
  echo "   ⚠️  deploy 유저가 아직 없습니다 — vm-deploy-key-bootstrap.md 부터 진행하세요."
  sudo chmod 750 /etc/readmates
fi

echo "==> [2/3] /opt/readmates 디렉토리"
sudo mkdir -p /opt/readmates
if id -u deploy >/dev/null 2>&1; then
  sudo chown deploy:deploy /opt/readmates
fi

echo "==> [3/3] Caddy 설정 (${CADDY_SITE} → readmates-api:8080)"
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${CADDY_SITE} {
    reverse_proxy 127.0.0.1:8080
    log {
        output file /var/log/caddy/readmates.log
        format filter {
            wrap console
            request>uri delete
            request>headers>Authorization delete
            request>headers>Cookie delete
            request>headers>X-Readmates-Bff-Secret delete
        }
    }
}
EOF
sudo mkdir -p /var/log/caddy
sudo systemctl restart caddy
echo "   ✅ Caddy 설정 완료"

echo ""
echo "✅ 인프라 셋업 완료."
echo "   다음: GitHub Actions 의 'sync-config' 워크플로 실행 → 05-deploy-compose-stack.sh"
```

- [ ] **Step 2: shellcheck 통과 확인**

```bash
shellcheck deploy/oci/02-configure.sh
```

Expected: 에러 없음.

- [ ] **Step 3: 레거시 systemd 잔여 참조 정리**

`deploy/oci/readmates-server.service` 파일이 deploy/oci 디렉토리에 따로 있으면 (host JAR 모드용), 더 이상 안 쓰므로 삭제:

```bash
git rm -f deploy/oci/readmates-server.service 2>/dev/null || echo "(이미 없음)"
```

다른 스크립트에서 `readmates-server.service` 를 참조하는 곳이 있는지 검색:

```bash
grep -rn "readmates-server\.service" deploy/ docs/ 2>/dev/null || echo "(참조 없음)"
```

참조가 남아 있으면 해당 라인을 삭제하거나 주석 처리.

- [ ] **Step 4: 변경 사항 종합 검증**

```bash
git diff --stat
git diff deploy/oci/02-configure.sh | head -40
```

Expected: 02-configure.sh 가 ~100 line 줄어듦 + service 파일 삭제.

- [ ] **Step 5: 커밋**

```bash
git add deploy/oci/02-configure.sh
git add -u deploy/  # service 파일 삭제 반영
git commit -m "refactor(deploy): strip secret writing + legacy systemd from 02-configure

02-configure.sh now provisions infra only (dirs, Caddy). All secrets
flow through the sync-config GitHub Actions workflow into a deploy-user-
owned readmates.env. Legacy host-JAR systemd unit removed — compose
stack is the only supported runtime."
```

---

### Task 7: CHANGELOG + 후속 검증

**Files:**
- Modify: `/Users/kws/source/web/ReadMates/CHANGELOG.md`

- [ ] **Step 1: CHANGELOG Unreleased 섹션에 추가**

추가 내용 (Unreleased 섹션 가장 위):

```markdown
### Changed
- **deploy:** 운영 시크릿/설정 관리를 SSH 편집에서 GitHub Actions `sync-config` 워크플로로 이관. `deploy/oci/02-configure.sh` 는 인프라 셋업만 담당. 로컬 개발은 `deploy/local/compose.override.yml` 로 운영과 동일한 compose 스택을 띄울 수 있게 됨. 자세한 절차: `docs/operations/runbooks/secrets-management.md`, `docs/operations/runbooks/vm-deploy-key-bootstrap.md`.

### Removed
- **deploy:** 레거시 host JAR systemd 유닛 (`readmates-server.service`) 및 `02-configure.sh` 의 readmates.env heredoc 작성 블록 제거.
```

- [ ] **Step 2: 전체 diff 한 번 더 확인**

```bash
git status
git diff --stat
```

Expected: 6개 파일 (신규 4 + 수정 2) + 삭제 1 (service).

- [ ] **Step 3: 시크릿 누출 회귀 검사 — 최종 grep**

```bash
git diff HEAD~7..HEAD -- ':!*.md' | grep -E '(sk-|ghp_|-----BEGIN )' && echo "::ERROR:: 시크릿으로 보이는 패턴 발견" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record secrets-via-actions migration"
```

---

## Self-Review 체크리스트 (실행자가 마지막에 확인)

- [ ] Spec §3 아키텍처 다이어그램과 실제 산출물이 일치하는가?
- [ ] Spec §4.1 GitHub 측 보안 — `echo` 패턴 grep 통과? environment "production" + required reviewer 가 GitHub UI 에서 설정되었는가?
- [ ] Spec §4.2 SSH 측 — 비표준 포트 2222, deploy 유저, sudoers 4개 명령 — runbook과 일치?
- [ ] Spec §4.3 VM 측 — chmod 600, 백업/롤백 동작 — 워크플로 step 4/8 에 구현?
- [ ] Spec §5 산출물 6종 모두 PR에 포함?
- [ ] Spec §7 오류 처리 표와 워크플로 step 매핑 일치?
- [ ] Spec §9 마이그레이션 단계 — Task 1~6 순서대로 따라가면 수행 가능?

## 마이그레이션 실행 (코드 머지 후, 운영자 수동)

이건 PR이 머지된 다음 운영자가 수동으로 하는 절차 — 코드 변경 아님:

1. `vm-deploy-key-bootstrap.md` 11단계 수행 (1회).
2. GitHub Secrets/Variables에 인벤토리표의 모든 키 등록.
3. Actions → sync-config → `dry_run=true` 로 1회 실행 → 워크플로 step 1, 2 만 통과 확인.
4. sync-config → `dry_run=false, restart_api=true` 로 실행 → `production` 승인 → 완료.
5. `curl https://api.<domain>/actuator/health` = `UP`.
6. 신규 02-configure.sh 를 신규 VM 한 번 더 dry-run (선택).

---

## Execution Handoff

이 plan은 6+1 task, 모두 docs/config 변경 + 워크플로 1개 — 코드 로직 변경 없음. 운영 시크릿이 끼어들지 않으면 PR 머지 자체는 무위험.

**다음으로 진행할 실행 모드 선택:**

1. **Subagent-Driven (recommended)** — task별로 fresh subagent 디스패치, task 사이 리뷰
2. **Inline Execution** — 이 세션에서 task별로 진행
