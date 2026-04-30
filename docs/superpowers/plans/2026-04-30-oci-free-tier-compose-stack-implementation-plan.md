# OCI Free Tier Compose Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ReadMates backend operations toward a Caddy-included Docker Compose stack on Oracle Cloud Always Free while keeping Redis/Kafka rollout reversible.

**Architecture:** The final VM process tree is `systemd -> docker compose -> caddy/readmates-api/redis/redpanda`. Caddy is the only public ingress on ports 80/443, the Spring Boot container listens only inside the compose network, and Redis/Redpanda are internal infrastructure services. Existing host JAR deployment remains available as a rollback path until compose cutover is verified.

**Tech Stack:** Bash deploy scripts, Docker Engine, Docker Compose plugin, Caddy 2, Eclipse Temurin Java 21 runtime image, Spring Boot/Kotlin, Redis 7.4, Redpanda single-node Kafka-compatible broker, OCI Compute Always Free.

---

## Scope Check

The approved design covers one deploy subsystem: OCI backend runtime packaging and operations. It crosses server packaging, deploy scripts, and deploy docs, but all tasks produce one deployable backend stack and share one rollback model. No frontend behavior changes are planned.

## File Structure

- Create `server/Dockerfile`: packages the already-built Spring Boot JAR into a small Java 21 runtime image.
- Create `server/.dockerignore`: keeps Gradle caches, source build noise, and local files out of the Docker build context.
- Create `deploy/oci/compose.yml`: final Caddy + Spring Boot + Redis + Redpanda compose stack.
- Create `deploy/oci/Caddyfile`: Caddy reverse proxy config using `CADDY_SITE` and internal upstream `readmates-api:8080`.
- Create `deploy/oci/readmates-stack.service`: systemd unit that manages the compose stack.
- Create `deploy/oci/04-install-docker.sh`: remote VM bootstrap script for Docker Engine and Compose plugin.
- Create `deploy/oci/05-deploy-compose-stack.sh`: local deployment script that builds the server image, transfers runtime files, loads the image on the VM, runs a DB backup hook, starts compose, and checks health.
- Modify `deploy/oci/compose.infra.yml`: keep as dev/transition-only and ensure it does not conflict with the final `compose.yml`.
- Modify `docs/deploy/oci-backend.md`: document compose-stack rollout, rollback, Caddy migration, Redis/Kafka flags, and the old JAR path as rollback-only.
- Modify `.env.example`: add compose-specific `CADDY_SITE`, `READMATES_SERVER_IMAGE`, and internal Redis/Kafka endpoint examples without secrets.

## Task 1: Add Server Container Image Assets

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`
- Test: Docker build command

- [x] **Step 1: Build the current JAR before adding Docker files**

Run:

```bash
./server/gradlew -p server bootJar
```

Expected: `BUILD SUCCESSFUL` and `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar` exists.

- [x] **Step 2: Create `server/Dockerfile`**

Write exactly:

```dockerfile
FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar /app/readmates-server.jar

RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/readmates-server.jar"]
```

- [x] **Step 3: Create `server/.dockerignore`**

Write exactly:

```gitignore
.gradle
build/classes
build/generated
build/kotlin
build/reports
build/test-results
build/tmp
src
gradle
gradlew
gradlew.bat
*.iml
```

Do not ignore `build/libs/readmates-server-0.0.1-SNAPSHOT.jar`; the Dockerfile copies it.

- [x] **Step 4: Build the image locally**

Run:

```bash
docker build -t readmates-server:local server
```

Expected: image builds successfully. If Docker is not available locally, record the skip reason and continue to script validation.

- [x] **Step 5: Commit**

```bash
git add server/Dockerfile server/.dockerignore
git commit -m "build: add readmates server docker image"
```

## Task 2: Add Final Compose Stack Runtime Files

**Files:**
- Create: `deploy/oci/compose.yml`
- Create: `deploy/oci/Caddyfile`
- Create: `deploy/oci/readmates-stack.service`
- Modify: `deploy/oci/compose.infra.yml`
- Test: `docker compose -f deploy/oci/compose.yml config`

- [x] **Step 1: Create `deploy/oci/compose.yml`**

Write exactly:

```yaml
name: readmates

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    env_file:
      - /etc/readmates/caddy.env
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - readmates-caddy-data:/data
      - readmates-caddy-config:/config
    depends_on:
      readmates-api:
        condition: service_healthy

  readmates-api:
    image: ${READMATES_SERVER_IMAGE:-readmates-server:local}
    restart: unless-stopped
    env_file:
      - /etc/readmates/readmates.env
    environment:
      READMATES_REDIS_URL: redis://redis:6379
      READMATES_KAFKA_BOOTSTRAP_SERVERS: redpanda:9092
      READMATES_MANAGEMENT_ADDRESS: 0.0.0.0
      READMATES_MANAGEMENT_PORT: 8081
    expose:
      - "8080"
      - "8081"
    depends_on:
      redis:
        condition: service_healthy
      redpanda:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/internal/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 20
      start_period: 45s

  redis:
    image: redis:7.4-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    expose:
      - "6379"
    volumes:
      - readmates-redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 5s

  redpanda:
    image: docker.redpanda.com/redpandadata/redpanda:v24.3.7
    restart: unless-stopped
    command:
      - redpanda
      - start
      - --overprovisioned
      - --smp=1
      - --memory=512M
      - --reserve-memory=0M
      - --node-id=0
      - --check=false
      - --kafka-addr=PLAINTEXT://0.0.0.0:9092
      - --advertise-kafka-addr=PLAINTEXT://redpanda:9092
    expose:
      - "9092"
    volumes:
      - readmates-redpanda-data:/var/lib/redpanda/data
    healthcheck:
      test: ["CMD-SHELL", "rpk cluster health --exit-when-healthy --watch=false"]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 30s

volumes:
  readmates-caddy-data:
  readmates-caddy-config:
  readmates-redis-data:
  readmates-redpanda-data:
```

- [x] **Step 2: Create `deploy/oci/Caddyfile`**

Write exactly:

```caddyfile
{$CADDY_SITE} {
    reverse_proxy readmates-api:8080

    log {
        output stdout
        format console
    }
}
```

- [x] **Step 3: Create `deploy/oci/readmates-stack.service`**

Write exactly:

```ini
[Unit]
Description=ReadMates Docker Compose Stack
Requires=docker.service
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/readmates
ExecStart=/usr/bin/docker compose -f /opt/readmates/compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f /opt/readmates/compose.yml stop
TimeoutStartSec=300
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

- [x] **Step 4: Add a transition warning to `deploy/oci/compose.infra.yml`**

Insert this comment at the top of the file:

```yaml
# Transition-only helper for running Redis and Redpanda beside the legacy host JAR deployment.
# The final OCI runtime uses deploy/oci/compose.yml, which also includes Caddy and readmates-api.
```

- [ ] **Step 5: Validate compose syntax**

Run:

```bash
READMATES_SERVER_IMAGE=readmates-server:local docker compose -f deploy/oci/compose.yml config
```

Expected: normalized compose configuration prints without errors. If local Docker Compose is unavailable, run this check on the VM after Task 3.

- [x] **Step 6: Commit**

```bash
git add deploy/oci/compose.yml deploy/oci/Caddyfile deploy/oci/readmates-stack.service deploy/oci/compose.infra.yml
git commit -m "deploy: add oci compose stack"
```

## Task 3: Add Docker Installation Script

**Files:**
- Create: `deploy/oci/04-install-docker.sh`
- Test: `bash -n deploy/oci/04-install-docker.sh`

- [x] **Step 1: Create `deploy/oci/04-install-docker.sh`**

Write exactly:

```bash
#!/usr/bin/env bash
# 04-install-docker.sh — Docker Engine + Compose plugin 설치
# 실행: ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
set -euo pipefail

echo "==> [1/5] Docker prerequisites 설치"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

echo "==> [2/5] Docker apt repository 등록"
sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

echo "==> [3/5] Docker Engine 설치"
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> [4/5] readmates 운영 디렉터리 준비"
sudo useradd -r -s /usr/sbin/nologin -d /opt/readmates readmates 2>/dev/null || true
sudo mkdir -p /opt/readmates /etc/readmates
sudo chown -R readmates:readmates /opt/readmates
sudo chmod 755 /opt/readmates

echo "==> [5/5] Docker 동작 확인"
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version

echo ""
echo "Docker 설치 완료. 다음: 로컬에서 deploy/oci/05-deploy-compose-stack.sh 실행"
```

- [x] **Step 2: Make the script executable**

Run:

```bash
chmod +x deploy/oci/04-install-docker.sh
```

- [x] **Step 3: Validate shell syntax**

Run:

```bash
bash -n deploy/oci/04-install-docker.sh
```

Expected: no output and exit code 0.

- [x] **Step 4: Commit**

```bash
git add deploy/oci/04-install-docker.sh
git commit -m "deploy: add docker install bootstrap"
```

## Task 4: Add Compose Deployment Script

**Files:**
- Create: `deploy/oci/05-deploy-compose-stack.sh`
- Test: `bash -n deploy/oci/05-deploy-compose-stack.sh`

- [x] **Step 1: Create `deploy/oci/05-deploy-compose-stack.sh`**

Write exactly:

```bash
#!/usr/bin/env bash
# 05-deploy-compose-stack.sh — Caddy 포함 Docker Compose stack 배포
# 사용법: VM_PUBLIC_IP=1.2.3.4 CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
set -euo pipefail

: "${VM_PUBLIC_IP:?VM_PUBLIC_IP 환경변수를 지정하세요}"
: "${CADDY_SITE:?CADDY_SITE 환경변수를 지정하세요. 예: CADDY_SITE=api.example.com}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/readmates_oci}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
SSH_STRICT_HOST_KEY_CHECKING="${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}"
APP_BASE_URL="${READMATES_APP_BASE_URL:-https://readmates.pages.dev}"
IMAGE_TAG="${READMATES_SERVER_IMAGE:-readmates-server:local}"
IMAGE_ARCHIVE="${TMPDIR:-/tmp}/readmates-server-image.tar"
JAR_PATH="server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar"
COMPOSE_FILE="deploy/oci/compose.yml"
CADDYFILE="deploy/oci/Caddyfile"
SERVICE_FILE="deploy/oci/readmates-stack.service"
REMOTE_DIR="/opt/readmates"

SSH_OPTIONS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING}")

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "필수 파일 없음: $path" >&2
    exit 1
  fi
}

echo "==> [1/9] 필수 파일 확인"
require_file "$JAR_PATH"
require_file "$COMPOSE_FILE"
require_file "$CADDYFILE"
require_file "$SERVICE_FILE"

echo "==> [2/9] Docker image build: ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" server
docker save "${IMAGE_TAG}" -o "${IMAGE_ARCHIVE}"

echo "==> [3/9] VM Docker/Compose 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "docker version >/dev/null && docker compose version >/dev/null"

echo "==> [4/9] runtime files 전송"
scp "${SSH_OPTIONS[@]}" "$IMAGE_ARCHIVE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-server-image.tar"
scp "${SSH_OPTIONS[@]}" "$COMPOSE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-compose.yml"
scp "${SSH_OPTIONS[@]}" "$CADDYFILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-Caddyfile"
scp "${SSH_OPTIONS[@]}" "$SERVICE_FILE" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-stack.service"

echo "==> [5/9] VM runtime files 설치"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
sudo mkdir -p ${REMOTE_DIR} /etc/readmates
sudo mv /tmp/readmates-compose.yml ${REMOTE_DIR}/compose.yml
sudo mv /tmp/readmates-Caddyfile ${REMOTE_DIR}/Caddyfile
sudo mv /tmp/readmates-stack.service /etc/systemd/system/readmates-stack.service
printf 'CADDY_SITE=%s\n' '${CADDY_SITE}' | sudo tee /etc/readmates/caddy.env >/dev/null
sudo chmod 600 /etc/readmates/caddy.env
sudo chown -R readmates:readmates ${REMOTE_DIR}
sudo systemctl daemon-reload
sudo docker load -i /tmp/readmates-server-image.tar
rm -f /tmp/readmates-server-image.tar
EOF

echo "==> [6/9] compose 설정 검증"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "cd ${REMOTE_DIR} && sudo READMATES_SERVER_IMAGE='${IMAGE_TAG}' docker compose -f compose.yml config >/dev/null"

echo "==> [7/9] 기존 host Caddy/Spring 서비스 정지"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<'EOF'
set -euo pipefail
if systemctl list-unit-files readmates-server.service >/dev/null 2>&1; then
  sudo systemctl stop readmates-server || true
  sudo systemctl disable readmates-server || true
fi
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  sudo systemctl stop caddy || true
  sudo systemctl disable caddy || true
fi
EOF

echo "==> [8/9] compose stack 시작"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
sudo systemctl enable readmates-stack
cd ${REMOTE_DIR}
sudo READMATES_SERVER_IMAGE='${IMAGE_TAG}' docker compose -f compose.yml up -d --remove-orphans
sudo docker compose -f compose.yml ps
EOF

echo "==> [9/9] health smoke"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" "sudo bash -s" <<EOF
set -euo pipefail
cd ${REMOTE_DIR}
for i in \$(seq 1 40); do
  if sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health; then
    exit 0
  fi
  sleep 3
done
sudo docker compose -f compose.yml logs --tail=200 readmates-api
exit 1
EOF

curl -fsS "${APP_BASE_URL}/api/bff/api/auth/me" >/dev/null

echo ""
echo "Compose stack 배포 완료"
echo "VM health: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'cd ${REMOTE_DIR} && sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health'"
echo "Logs: ssh -i ${SSH_KEY} ${REMOTE_USER}@${VM_PUBLIC_IP} 'sudo docker compose -f ${REMOTE_DIR}/compose.yml logs -f --tail=200'"
```

- [x] **Step 2: Make the script executable**

Run:

```bash
chmod +x deploy/oci/05-deploy-compose-stack.sh
```

- [x] **Step 3: Validate shell syntax**

Run:

```bash
bash -n deploy/oci/05-deploy-compose-stack.sh
```

Expected: no output and exit code 0.

- [x] **Step 4: Add a manual DB backup gate before production execution**

Insert this block immediately before `echo "==> [7/9] 기존 host Caddy/Spring 서비스 정지"`:

```bash
echo "==> [7/10] DB backup 확인"
ssh "${SSH_OPTIONS[@]}" "${REMOTE_USER}@${VM_PUBLIC_IP}" \
  "test -d /var/backups/readmates/mysql && sudo find /var/backups/readmates/mysql -type f -name '*.sql.gz' -mtime -2 | grep -q ."
```

Then renumber the later progress messages from `[7/9]`, `[8/9]`, `[9/9]` to `[8/10]`, `[9/10]`, `[10/10]`.

- [x] **Step 5: Commit**

```bash
git add deploy/oci/05-deploy-compose-stack.sh
git commit -m "deploy: add compose stack deploy script"
```

## Task 5: Update Environment and Deployment Docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/README.md` (docs quality review fix)
- Create: `docs/deploy/compose-stack.md`
- Test: `git diff --check -- .env.example docs/deploy/oci-backend.md docs/deploy/compose-stack.md docs/deploy/README.md`

- [x] **Step 1: Add compose examples to `.env.example`**

Add these public-safe lines near the deploy/runtime section:

```bash
CADDY_SITE=api.example.com
READMATES_SERVER_IMAGE=readmates-server:local
READMATES_REDIS_URL=redis://redis:6379
READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092
```

Keep all secret values as existing placeholders or disabled defaults.

- [x] **Step 2: Create `docs/deploy/compose-stack.md`**

Write a concise runbook with these sections and commands:

```markdown
# OCI Compose Stack

ReadMates의 최종 OCI backend runtime은 Caddy, Spring Boot API, Redis, Redpanda를 Docker Compose stack으로 실행한다. Public ingress는 Caddy 80/443뿐이고 Spring Boot, Redis, Redpanda는 compose internal network에 둔다.

## Files

- `deploy/oci/04-install-docker.sh`: VM Docker bootstrap
- `deploy/oci/05-deploy-compose-stack.sh`: local compose deployment
- `deploy/oci/compose.yml`: runtime stack
- `deploy/oci/Caddyfile`: Caddy reverse proxy
- `deploy/oci/readmates-stack.service`: systemd wrapper

## First Setup

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
```

## Deploy

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

Set `READMATES_SERVER_IMAGE` to the previous image tag and rerun compose:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo READMATES_SERVER_IMAGE=readmates-server:previous docker compose -f compose.yml up -d readmates-api'
```

If compose cutover itself fails, stop `readmates-stack`, re-enable the legacy host services, and restore the last known JAR deployment.

## Redis and Kafka Flags

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
```

- [x] **Step 3: Update `docs/deploy/oci-backend.md`**

Add a section linking to `compose-stack.md` and state:

```markdown
## Docker Compose Stack

Caddy 포함 최종 backend runtime은 [compose-stack.md](compose-stack.md)를 기준으로 운영한다. 기존 JAR + host Caddy 방식은 compose cutover 전 단계와 rollback 경로로 유지한다.

운영 전환 순서:

1. `04-install-docker.sh`로 VM Docker runtime을 준비한다.
2. `bootJar`와 server test를 통과시킨다.
3. DB backup을 만든다.
4. `05-deploy-compose-stack.sh`로 image, compose file, Caddyfile, systemd unit을 배포한다.
5. `/internal/health`, BFF auth smoke, OAuth redirect smoke를 확인한다.
6. Redis feature flag를 단계적으로 켠다.
7. Kafka/notification flag는 Redis 안정화 뒤 별도 smoke로 켠다.
```

- [x] **Step 4: Validate docs**

Run:

```bash
git diff --check -- .env.example docs/deploy/oci-backend.md docs/deploy/compose-stack.md
```

Expected: `git diff --check` has no output. Public release scanning runs in Task 6 after all deploy docs and scripts are in place.

- [x] **Step 5: Commit**

```bash
git add .env.example docs/deploy/oci-backend.md docs/deploy/compose-stack.md
git commit -m "docs: document oci compose stack operations"
```

- [x] **Step 6: Address docs quality review**

Clarified compose stack prerequisites, rollback commands, and deploy hub status. Committed follow-up with:

```bash
git add docs/deploy/compose-stack.md docs/deploy/README.md docs/superpowers/plans/2026-04-30-oci-free-tier-compose-stack-implementation-plan.md
git commit -m "docs: clarify compose stack prerequisites and rollback"
```

## Task 6: Local Verification Before Production Cutover

**Files:**
- No source changes expected
- Test: server, docs, compose, public release safety

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Build boot JAR**

Run:

```bash
./server/gradlew -p server bootJar
```

Expected: `BUILD SUCCESSFUL` and JAR exists.

- [ ] **Step 3: Build Docker image**

Run:

```bash
docker build -t readmates-server:local server
```

Expected: image builds successfully.

- [ ] **Step 4: Validate compose config**

Run:

```bash
READMATES_SERVER_IMAGE=readmates-server:local docker compose -f deploy/oci/compose.yml config >/tmp/readmates-compose-config.yml
```

Expected: command exits 0 and `/tmp/readmates-compose-config.yml` contains services `caddy`, `readmates-api`, `redis`, `redpanda`.

- [ ] **Step 5: Run public release safety checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: release candidate builds and public release scanner passes.

- [ ] **Step 6: Commit verification-only changes if any**

If verification produced tracked doc or config changes, commit them. If no files changed, do not create an empty commit.

```bash
git status --short
```

Expected: clean worktree or only intentionally generated ignored artifacts.

## Task 7: Production Cutover Runbook

**Files:**
- No repository changes expected during cutover
- Test: production smoke commands

- [ ] **Step 1: Prepare VM resource headroom**

In OCI Console, prefer resizing the A1 VM to `2 OCPU / 12 GB memory` within Always Free allocation. If capacity is unavailable, continue with current size only after confirming memory headroom:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'free -h && df -h /'
```

Expected: at least 2 GB available memory and at least 15 GB free disk before Redpanda is enabled.

- [ ] **Step 2: Install Docker on VM**

Run:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'bash -s' < deploy/oci/04-install-docker.sh
```

Expected: `docker version` and `docker compose version` print successfully.

- [ ] **Step 3: Confirm secrets remain only on VM**

Run:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'sudo test -s /etc/readmates/readmates.env && sudo stat -c "%a %U:%G %n" /etc/readmates/readmates.env'
```

Expected: file exists and permissions are `600`.

- [ ] **Step 4: Create fresh DB backup**

Use the existing operational backup flow. The backup file must be outside Git and stored under the VM backup directory or Object Storage backup process already used by ReadMates.

Run the current backup command used for releases. If using direct `mysqldump`, include `--no-tablespaces` to avoid PROCESS privilege failure.

Expected: a `.sql.gz` backup newer than 48 hours exists before cutover.

- [ ] **Step 5: Deploy compose stack**

Run:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP=VM_PUBLIC_IP CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
```

Expected: script completes, `/internal/health` returns JSON with `status` equal to `UP`, and BFF auth smoke returns HTTP 200.

- [ ] **Step 6: Run production smoke**

Run:

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev ./scripts/smoke-production-integrations.sh
curl -fsS https://readmates.pages.dev/api/bff/api/auth/me
```

Expected: domain marker passes, OAuth redirect URI matches expected auth origin, auth/me returns anonymous JSON with HTTP 200.

- [ ] **Step 7: Verify internal services**

Run:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml ps'
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml exec -T redis redis-cli ping'
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml exec -T redpanda rpk cluster health --exit-when-healthy --watch=false'
```

Expected: compose services are running, Redis prints `PONG`, Redpanda reports healthy.

## Task 8: Feature Flag Rollout After Cutover

**Files:**
- No repository changes expected
- Test: targeted smoke and rollback switches

- [ ] **Step 1: Enable Redis base and rate limit**

Edit `/etc/readmates/readmates.env` on the VM to set:

```bash
READMATES_REDIS_ENABLED=true
READMATES_RATE_LIMIT_ENABLED=true
READMATES_AUTH_SESSION_CACHE_ENABLED=false
READMATES_PUBLIC_CACHE_ENABLED=false
READMATES_NOTES_CACHE_ENABLED=false
```

Restart only the app:

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && sudo docker compose -f compose.yml restart readmates-api'
```

Expected: `/internal/health` remains `UP`.

- [ ] **Step 2: Enable auth session and read caches**

After rate limit has been stable, set:

```bash
READMATES_AUTH_SESSION_CACHE_ENABLED=true
READMATES_PUBLIC_CACHE_ENABLED=true
READMATES_NOTES_CACHE_ENABLED=true
```

Restart `readmates-api` and run:

```bash
curl -fsS https://readmates.pages.dev/api/bff/api/auth/me
curl -fsS https://readmates.pages.dev/api/bff/api/public/clubs/reading-sai
```

Expected: both requests return HTTP 200. Public club response should still be valid JSON.

- [ ] **Step 3: Enable Kafka notification pipeline**

Only after Redpanda health is stable, set:

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_KAFKA_ENABLED=true
READMATES_KAFKA_NOTIFICATION_EVENTS_TOPIC=readmates.notification.events.v1
READMATES_KAFKA_NOTIFICATION_DLQ_TOPIC=readmates.notification.events.dlq.v1
READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP=readmates-notification-dispatcher
```

Restart `readmates-api`.

Expected: app starts without Kafka bootstrap errors. Notification operations screen or DB status queries show outbox rows progressing from pending to published when a notification event is generated.

- [ ] **Step 4: Record rollback switches**

If Redis causes user-facing errors, set:

```bash
READMATES_REDIS_ENABLED=false
READMATES_RATE_LIMIT_ENABLED=false
READMATES_AUTH_SESSION_CACHE_ENABLED=false
READMATES_PUBLIC_CACHE_ENABLED=false
READMATES_NOTES_CACHE_ENABLED=false
```

If Redpanda causes notification errors, set:

```bash
READMATES_NOTIFICATIONS_ENABLED=false
READMATES_KAFKA_ENABLED=false
```

Restart `readmates-api` after either rollback.

## Task 9: Final Release Hygiene

**Files:**
- Modify if needed: `CHANGELOG.md`
- Modify if needed: `docs/deploy/oci-backend.md`
- Test: release checks

- [ ] **Step 1: Update release notes if production cutover ships in a versioned release**

Add a concise deployment note to the next `CHANGELOG.md` version:

```markdown
### Deployment Notes

- Backend runtime can now run as a Caddy-included Docker Compose stack on OCI Always Free.
- Redis is rolled out through independent feature flags.
- Redpanda provides the Kafka-compatible broker for low-volume notification delivery.
- Legacy host JAR deployment remains available as a rollback path during the transition.
```

- [ ] **Step 2: Run final verification**

Run:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
READMATES_SERVER_IMAGE=readmates-server:local docker compose -f deploy/oci/compose.yml config >/tmp/readmates-compose-config.yml
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands pass.

- [ ] **Step 3: Commit final release documentation if changed**

```bash
git status --short
git add CHANGELOG.md docs/deploy/oci-backend.md docs/deploy/compose-stack.md
git commit -m "docs: add compose stack release notes"
```

Only run the commit if `git status --short` shows intended tracked changes.

## Self-Review

- Spec coverage: The plan covers Caddy included compose runtime, internal-only Spring/Redis/Redpanda networking, Redis-first flag rollout, Redpanda low-usage configuration, systemd wrapper, deployment script, rollback, docs, and release safety checks.
- Placeholder scan: The plan uses public-safe examples such as `api.example.com`, `VM_PUBLIC_IP`, and `readmates-server:local`. It does not include real IPs, secrets, OCIDs, local absolute paths, or incomplete implementation markers.
- Type and naming consistency: Compose service names are consistently `caddy`, `readmates-api`, `redis`, and `redpanda`. Environment names match `server/src/main/resources/application.yml`: `READMATES_REDIS_URL`, `READMATES_KAFKA_BOOTSTRAP_SERVERS`, `READMATES_REDIS_ENABLED`, `READMATES_RATE_LIMIT_ENABLED`, `READMATES_AUTH_SESSION_CACHE_ENABLED`, `READMATES_PUBLIC_CACHE_ENABLED`, `READMATES_NOTES_CACHE_ENABLED`, `READMATES_NOTIFICATIONS_ENABLED`, and `READMATES_KAFKA_ENABLED`.
