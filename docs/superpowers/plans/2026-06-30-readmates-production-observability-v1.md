# ReadMates Production Observability v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing ReadMates Prometheus/Grafana/Alertmanager assets operational on the OCI compose runtime, then close the alert triage documentation needed before treating alerts as production-ready.

**Architecture:** Keep observability v1 on the same OCI VM and Docker Compose project as `readmates-api`, using Docker service DNS for `readmates-api:8081`, `prometheus:9090`, and `alertmanager:9093`. Grafana is provisioned from Git-tracked datasource/dashboard files but exposed only on VM loopback and reached through SSH tunnel. Alertmanager remains optional until SMTP environment variables are available.

**Tech Stack:** Docker Compose, Prometheus `v2.55.0`, Grafana `11.5.1`, Alertmanager `v0.27.0`, Spring Boot Actuator `/actuator/prometheus`, Bash deploy scripts, Korean-first runbooks.

## Global Constraints

- Do not introduce OCI Logging, Loki, ELK, OpenSearch, Sentry, Cloudflare Web Analytics, browser RUM, `node-exporter`, `cadvisor`, `blackbox-exporter`, `redis-exporter`, or a separate observability VM in this v1 implementation.
- Do not expose Prometheus, Grafana, or Alertmanager admin UI to the public internet.
- Keep Grafana bound to `127.0.0.1:3001` on the VM; operators use SSH tunnel to view it.
- Do not commit real VM IPs, private domains, SMTP credentials, Grafana passwords, OCIDs, deployment state, member data, or token-shaped examples.
- `grafana.env` and `alertmanager.env` are VM-local generated files only.
- Prometheus scrape targets must use Docker service DNS names, not public IPs.
- Do not change database schema, auth cookie contract, OAuth flow, BFF trust boundary, or user-facing product behavior.
- Local validation proves config shape and provisioning only; production health requires VM smoke evidence.

---

## File Structure

- `deploy/oci/compose.infra.yml`
  - Owns OCI infra/observability services that join the same `readmates` compose project/network.
  - Adds `grafana` with loopback-only port binding, mounted provisioning, mounted dashboard JSON, healthcheck, and persistent volume.
- `deploy/oci/grafana/provisioning/datasources/prometheus.yml`
  - Provisions Grafana datasource `ReadMates Prometheus` at `http://prometheus:9090`.
- `deploy/oci/grafana/provisioning/dashboards/readmates.yml`
  - Provisions the ReadMates dashboard folder from `/var/lib/grafana/dashboards/readmates`.
- `deploy/oci/06-deploy-observability-stack.sh`
  - Copies compose, Prometheus config, Alertmanager config, alert rules, Grafana provisioning, and dashboard files to the VM.
  - Generates VM-local `alertmanager.env` and `grafana.env` without committing secrets.
  - Supports full stack and metrics/dashboard-first service selections.
  - Runs smoke checks for requested services.
- `docs/operations/runbooks/observability-bootstrap.md`
  - Operator runbook for local smoke, VM bring-up, SSH tunnel access, production smoke, and alert triage entry points.
- `docs/operations/runbooks/README.md`
  - Updates the runbook index label.
- `docs/deploy/security-public-repo.md`
  - Documents observability secret handling and public-repo safety rules.
- `scripts/public-release-check.sh`
  - Extends observability public-safety scanning to `deploy/oci/grafana`.
- `docs/operations/observability/alerts.md`
  - Replaces inactive alert runbook gaps with actionable, public-safe triage guidance.

---

### Task 1: Production Grafana Stack And Deploy Script

**Files:**
- Modify: `deploy/oci/compose.infra.yml`
- Create: `deploy/oci/grafana/provisioning/datasources/prometheus.yml`
- Create: `deploy/oci/grafana/provisioning/dashboards/readmates.yml`
- Modify: `deploy/oci/06-deploy-observability-stack.sh`

**Interfaces:**
- Consumes: existing `deploy/oci/prometheus/prometheus.yml`, `deploy/oci/alertmanager/alertmanager.yml`, `ops/prometheus/alerts/`, `ops/grafana/dashboards/`.
- Produces: `grafana` compose service, VM-local `grafana.env`, Grafana datasource name `ReadMates Prometheus`, dashboard provider name `ReadMates`, and deployment service selector `READMATES_OBSERVABILITY_SERVICES`.

- [ ] **Step 1: Confirm current working tree state before editing**

Run:

```bash
git status --short --branch --untracked-files=all
```

Expected: any pre-existing changes are observability-related. Do not stage unrelated files. If unrelated user changes appear, leave them untouched.

- [ ] **Step 2: Add or verify the Grafana compose service**

Edit `deploy/oci/compose.infra.yml` so it contains this `grafana` service block under `services:`:

```yaml
  grafana:
    image: grafana/grafana:11.5.1
    restart: unless-stopped
    env_file:
      - ./grafana.env
    ports:
      - "127.0.0.1:3001:3000"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ../../ops/grafana/dashboards:/var/lib/grafana/dashboards/readmates:ro
      - readmates_grafana_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health >/dev/null"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Also ensure the `volumes:` section includes:

```yaml
  readmates_grafana_data:
```

- [ ] **Step 3: Add Grafana datasource provisioning**

Create `deploy/oci/grafana/provisioning/datasources/prometheus.yml` with exactly:

```yaml
apiVersion: 1

datasources:
  - name: ReadMates Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

- [ ] **Step 4: Add Grafana dashboard provisioning**

Create `deploy/oci/grafana/provisioning/dashboards/readmates.yml` with exactly:

```yaml
apiVersion: 1

providers:
  - name: ReadMates
    orgId: 1
    folder: ReadMates
    type: file
    disableDeletion: false
    allowUiUpdates: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards/readmates
```

- [ ] **Step 5: Extend the observability deploy script constants and env writers**

Modify `deploy/oci/06-deploy-observability-stack.sh`.

The service defaults and Grafana paths must be:

```bash
SERVICES="${READMATES_OBSERVABILITY_SERVICES:-prometheus alertmanager grafana}"
SKIP_VALIDATE="${READMATES_SKIP_OBSERVABILITY_VALIDATE:-false}"
GRAFANA_ADMIN_USER="${READMATES_GRAFANA_ADMIN_USER:-readmates}"

COMPOSE_INFRA_FILE="deploy/oci/compose.infra.yml"
PROMETHEUS_FILE="deploy/oci/prometheus/prometheus.yml"
ALERTMANAGER_FILE="deploy/oci/alertmanager/alertmanager.yml"
ALERT_RULES_DIR="ops/prometheus/alerts"
GRAFANA_PROVISIONING_DIR="deploy/oci/grafana/provisioning"
GRAFANA_DASHBOARDS_DIR="ops/grafana/dashboards"
```

Add these functions after `require_alert_env()`:

```bash
require_grafana_env() {
  if [ -z "${READMATES_GRAFANA_ADMIN_PASSWORD:-}" ]; then
    printf 'Grafana 배포에는 READMATES_GRAFANA_ADMIN_PASSWORD 환경변수가 필요합니다.\n' >&2
    printf 'Prometheus만 먼저 띄우려면 READMATES_OBSERVABILITY_SERVICES=prometheus 로 실행하세요.\n' >&2
    return 1
  fi
}

write_alert_dummy_env() {
  local target="$1"
  umask 077
  {
    printf 'READMATES_ALERT_SMTP_HOST=smtp.example.com\n'
    printf 'READMATES_ALERT_SMTP_PORT=587\n'
    printf 'READMATES_ALERT_SMTP_USER=example-user\n'
    printf 'READMATES_ALERT_SMTP_PASSWORD=example-password\n'
    printf 'READMATES_ALERT_SMTP_FROM=alerts@example.com\n'
    printf 'READMATES_ALERT_EMAIL_TO=ops@example.com\n'
  } > "$target"
}

write_grafana_env() {
  local target="$1"
  local password="$2"
  umask 077
  {
    printf 'GF_SECURITY_ADMIN_USER=%s\n' "$GRAFANA_ADMIN_USER"
    printf 'GF_SECURITY_ADMIN_PASSWORD=%s\n' "$password"
    printf 'GF_AUTH_ANONYMOUS_ENABLED=false\n'
    printf 'GF_USERS_ALLOW_SIGN_UP=false\n'
    printf 'GF_ANALYTICS_REPORTING_ENABLED=false\n'
    printf 'GF_ANALYTICS_CHECK_FOR_UPDATES=false\n'
  } > "$target"
}

write_grafana_dummy_env() {
  local target="$1"
  umask 077
  {
    printf 'GF_SECURITY_ADMIN_USER=readmates\n'
    printf 'GF_SECURITY_ADMIN_PASSWORD=example-long-random-password\n'
    printf 'GF_AUTH_ANONYMOUS_ENABLED=false\n'
    printf 'GF_USERS_ALLOW_SIGN_UP=false\n'
    printf 'GF_ANALYTICS_REPORTING_ENABLED=false\n'
    printf 'GF_ANALYTICS_CHECK_FOR_UPDATES=false\n'
  } > "$target"
}
```

- [ ] **Step 6: Extend deploy script validation and transfer flow**

In `deploy/oci/06-deploy-observability-stack.sh`, require Grafana inputs only when Grafana is selected:

```bash
if service_enabled grafana; then
  require_grafana_env
  require_dir "$GRAFANA_PROVISIONING_DIR"
  require_dir "$GRAFANA_DASHBOARDS_DIR"
fi
```

In the local validation block, add:

```bash
if service_enabled grafana; then
  ./scripts/lint-grafana-dashboards.sh "$GRAFANA_DASHBOARDS_DIR"
fi
```

When creating temporary env files, use:

```bash
if service_enabled alertmanager; then
  write_alert_env "$tmpdir/alertmanager.env"
else
  write_alert_dummy_env "$tmpdir/alertmanager.env"
fi
if service_enabled grafana; then
  write_grafana_env "$tmpdir/grafana.env" "$READMATES_GRAFANA_ADMIN_PASSWORD"
else
  write_grafana_dummy_env "$tmpdir/grafana.env"
fi
```

Transfer both env files unconditionally because `docker compose config` needs both env files even when only a subset of services starts:

```bash
scp "${SSH_OPTIONS[@]}" "$tmpdir/alertmanager.env" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-alertmanager.env"
scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana.env" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana.env"
```

When Grafana is selected, transfer provisioning and dashboard archives:

```bash
if service_enabled grafana; then
  tar -C "$GRAFANA_PROVISIONING_DIR" -czf "$tmpdir/grafana-provisioning.tgz" .
  tar -C "$GRAFANA_DASHBOARDS_DIR" -czf "$tmpdir/grafana-dashboards.tgz" .
  scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana-provisioning.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana-provisioning.tgz"
  scp "${SSH_OPTIONS[@]}" "$tmpdir/grafana-dashboards.tgz" "${REMOTE_USER}@${VM_PUBLIC_IP}:/tmp/readmates-grafana-dashboards.tgz"
fi
```

- [ ] **Step 7: Extend remote install and smoke checks**

In the remote install block, create Grafana directories, move env files, extract selected Grafana archives, and chown all observability paths:

```bash
sudo install -d -m 0755 "$remote_dir/deploy/oci/prometheus" "$remote_dir/deploy/oci/alertmanager" "$remote_dir/deploy/oci/grafana/provisioning" "$remote_dir/ops/prometheus/alerts" "$remote_dir/ops/grafana/dashboards"
sudo mv /tmp/readmates-alertmanager.env "$remote_dir/deploy/oci/alertmanager.env"
sudo chmod 600 "$remote_dir/deploy/oci/alertmanager.env"
sudo mv /tmp/readmates-grafana.env "$remote_dir/deploy/oci/grafana.env"
sudo chmod 600 "$remote_dir/deploy/oci/grafana.env"

if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])grafana([[:space:]]|$)'; then
  sudo tar -xzf /tmp/readmates-grafana-provisioning.tgz -C "$remote_dir/deploy/oci/grafana/provisioning"
  sudo tar -xzf /tmp/readmates-grafana-dashboards.tgz -C "$remote_dir/ops/grafana/dashboards"
  sudo rm -f /tmp/readmates-grafana-provisioning.tgz /tmp/readmates-grafana-dashboards.tgz
fi

sudo chown -R readmates:readmates "$remote_dir/deploy/oci" "$remote_dir/ops/prometheus/alerts" "$remote_dir/ops/grafana/dashboards"
```

Add this Grafana smoke block before the final `docker compose ps`:

```bash
if printf '%s\n' "$services" | grep -Eq '(^|[[:space:]])grafana([[:space:]]|$)'; then
  for i in $(seq 1 30); do
    if sudo docker compose -p "$compose_project" -f compose.infra.yml exec -T grafana wget -qO- http://localhost:3000/api/health >/dev/null; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      sudo docker compose -p "$compose_project" -f compose.infra.yml logs --tail=120 grafana
      exit 1
    fi
    sleep 2
  done
fi
```

Print the operator tunnel command when Grafana is selected:

```bash
if service_enabled grafana; then
  echo "Grafana 접속:"
  echo "  ssh -i ${SSH_KEY} -L 13001:127.0.0.1:3001 ${REMOTE_USER}@${VM_PUBLIC_IP}"
  echo "  http://localhost:13001"
fi
```

- [ ] **Step 8: Run static and compose config checks**

Run:

```bash
bash -n deploy/oci/06-deploy-observability-stack.sh
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/readmates-compose-infra.XXXXXX")"
cp -R deploy/oci/. "$tmpdir/"
printf 'READMATES_ALERT_SMTP_HOST=smtp.example.com\nREADMATES_ALERT_SMTP_PORT=587\nREADMATES_ALERT_SMTP_USER=example-user\nREADMATES_ALERT_SMTP_PASSWORD=example-password\nREADMATES_ALERT_SMTP_FROM=alerts@example.com\nREADMATES_ALERT_EMAIL_TO=ops@example.com\n' > "$tmpdir/alertmanager.env"
printf 'GF_SECURITY_ADMIN_USER=readmates\nGF_SECURITY_ADMIN_PASSWORD=example-long-random-password\nGF_AUTH_ANONYMOUS_ENABLED=false\nGF_USERS_ALLOW_SIGN_UP=false\nGF_ANALYTICS_REPORTING_ENABLED=false\nGF_ANALYTICS_CHECK_FOR_UPDATES=false\n' > "$tmpdir/grafana.env"
docker compose -f "$tmpdir/compose.infra.yml" config >/tmp/readmates-compose-infra-config.out
rm -rf "$tmpdir"
```

Expected: all commands exit `0`. `/tmp/readmates-compose-infra-config.out` contains `grafana:` and `127.0.0.1:3001:3000`.

- [ ] **Step 9: Run observability validation checks**

Run:

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-alertmanager-config.sh
```

Expected:

- `lint-grafana-dashboards: 3 dashboard(s) ok`
- Prometheus rule/config checks report `SUCCESS`
- Alertmanager config check reports `SUCCESS`

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add deploy/oci/compose.infra.yml \
  deploy/oci/grafana/provisioning/datasources/prometheus.yml \
  deploy/oci/grafana/provisioning/dashboards/readmates.yml \
  deploy/oci/06-deploy-observability-stack.sh
git diff --cached --check
git commit -m "chore: add production grafana observability"
```

Expected: commit succeeds and only Task 1 files are staged.

---

### Task 2: Observability Runbooks And Public Safety

**Files:**
- Modify: `docs/operations/runbooks/observability-bootstrap.md`
- Modify: `docs/operations/runbooks/README.md`
- Modify: `docs/deploy/security-public-repo.md`
- Modify: `scripts/public-release-check.sh`
- Modify: `docs/operations/observability/alerts.md`

**Interfaces:**
- Consumes: Task 1 service names, loopback Grafana port, VM-local env file policy, and existing alert names.
- Produces: operator-facing runbook instructions, public-safety scanner coverage for Grafana provisioning, and active alert triage guidance.

- [ ] **Step 1: Update observability bootstrap title and preflight env section**

In `docs/operations/runbooks/observability-bootstrap.md`, make the opening lines:

```markdown
# Observability Bootstrap

운영자가 OCI VM에서 Prometheus + Alertmanager + Grafana를 처음 띄울 때 따라가는 절차.

## 사전 준비

Alertmanager까지 같이 띄울 때는 SMTP 환경변수 6개를 준비합니다:

```text
READMATES_ALERT_SMTP_HOST=smtp.example.com
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=example-user
READMATES_ALERT_SMTP_PASSWORD=example-password
READMATES_ALERT_SMTP_FROM=alerts@example.com
READMATES_ALERT_EMAIL_TO=ops@example.com
```

Grafana를 같이 띄울 때는 Git 밖 운영 채널에서 admin password를 정합니다:

```text
READMATES_GRAFANA_ADMIN_USER=readmates
READMATES_GRAFANA_ADMIN_PASSWORD=example-long-random-password
```
```

- [ ] **Step 2: Update bring-up commands and tunnel guidance**

In `docs/operations/runbooks/observability-bootstrap.md`, the `Bring-up` section must include:

```markdown
자동 배포 스크립트를 쓰는 경우:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
: "${READMATES_GRAFANA_ADMIN_PASSWORD:?set READMATES_GRAFANA_ADMIN_PASSWORD in your shell}"
./deploy/oci/06-deploy-observability-stack.sh
```

Prometheus + Grafana만 먼저 붙이고 email alert는 나중에 연결하려면:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
: "${READMATES_GRAFANA_ADMIN_PASSWORD:?set READMATES_GRAFANA_ADMIN_PASSWORD in your shell}"
READMATES_OBSERVABILITY_SERVICES="prometheus grafana" \
./deploy/oci/06-deploy-observability-stack.sh
```

이 모드에서는 Prometheus가 `readmates-api` metric을 긁고 Grafana dashboard를 볼 수 있다. Alertmanager container는 아직 없으므로 Prometheus target 목록에서 `alertmanager`가 down으로 보일 수 있다. Email alert까지 운영하려면 SMTP env를 채운 뒤 full stack으로 다시 실행한다.

VM 안에서 직접 compose를 실행하는 경우:

```bash
cd /opt/readmates/deploy/oci
docker compose -p readmates -f compose.infra.yml up -d prometheus alertmanager grafana
```

Grafana는 VM의 `127.0.0.1:3001`에만 바인딩한다. 운영자가 로컬 브라우저로 보려면 SSH 터널을 연다:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
ssh -i "$HOME/.ssh/readmates_oci" -L 13001:127.0.0.1:3001 ubuntu@"$VM_PUBLIC_IP"
```

그 다음 로컬 브라우저에서 `http://localhost:13001`을 연다.
```

- [ ] **Step 3: Update smoke and trouble sections**

In `docs/operations/runbooks/observability-bootstrap.md`, the `Smoke check` list must include Prometheus target health, Alertmanager readiness, Grafana readiness, rule load, and controlled alert test:

```markdown
1. Target healthy: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -c '"health":"up"'` — full stack 기준 3 이상이어야 (readmates-api, prometheus-self, alertmanager). Prometheus + Grafana만 먼저 올린 경우에는 readmates-api와 prometheus-self가 up인지 확인한다.
2. Alertmanager ready: `docker compose -p readmates -f compose.infra.yml exec -T alertmanager wget -qO- http://localhost:9093/-/ready` — 200 OK.
3. Grafana ready: `docker compose -p readmates -f compose.infra.yml exec -T grafana wget -qO- http://localhost:3000/api/health` — 200 OK.
4. Rule load: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"'` — 최소 6 그룹.
5. Test alert: Prometheus expr 브라우저에서 `vector(1)`로 임시 룰 추가 또는 alertmanager API에 `amtool alert add` — 운영자 inbox 수신 확인. (구체 절차는 alertmanager 공식 docs 참조.)
```

Add this trouble bullet:

```markdown
- Grafana 접속 실패: VM 보안그룹을 열지 말고 SSH 터널 `-L 13001:127.0.0.1:3001`이 살아있는지, `docker compose -p readmates -f compose.infra.yml ps grafana`가 healthy인지 확인.
```

- [ ] **Step 4: Add alert triage sections to observability bootstrap**

Append these sections before `## 후속` in `docs/operations/runbooks/observability-bootstrap.md`:

```markdown
## Target down

`ScrapeTargetDown`은 Prometheus가 5분 동안 target을 scrape하지 못했다는 뜻입니다.

1. `docker compose -p readmates -f compose.infra.yml ps`로 `readmates-api`, `prometheus`, `alertmanager`, `grafana` 상태를 확인합니다.
2. `docker compose -p readmates -f compose.infra.yml logs --tail=120 prometheus`로 scrape error를 확인합니다.
3. `readmates-server`만 down이면 app compose 쪽에서 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0`, `READMATES_MANAGEMENT_PORT=8081`, `readmates-api` health를 확인합니다.
4. 모든 target이 down이면 VM 또는 Docker daemon 장애 가능성이 높으므로 post-deploy watch와 read-only diagnostics runbook으로 이동합니다.

## HTTP error or latency

`HttpErrorRateHigh`와 `HttpLatencyP95High`는 사용자-facing API가 실패하거나 느려졌다는 신호입니다.

1. Grafana의 BFF/API latency와 Service Health dashboard에서 5xx ratio, p95 latency, route label을 확인합니다.
2. 최근 배포 직후라면 `deploy-attempts`와 post-deploy watch 로그를 먼저 확인합니다.
3. `requestId` 또는 시간대를 기준으로 [Correlation ID lookup](correlation-id-lookup.md)을 실행합니다.
4. Hikari pending, JVM heap, Redis error, notification backlog 중 동시에 상승한 지표를 찾아 병목 surface를 좁힙니다.
5. 원인이 최근 배포로 좁혀지고 사용자 영향이 지속되면 release runbook의 rollback 절차를 따릅니다.

## JVM and DB pool

`HikariConnectionPoolPending`은 DB connection을 기다리는 요청이 있다는 뜻이고, `JvmHeapHigh`는 heap 사용률이 85%를 넘었다는 뜻입니다.

1. Grafana에서 Hikari pending, active, idle, HTTP p95를 함께 봅니다.
2. `docker compose -p readmates -f compose.yml logs --tail=200 readmates-api`로 timeout, slow query, GC 관련 로그를 확인합니다.
3. pending이 지속되면 신규 배포, 배치 작업, notification relay 증가, DB 장애를 순서대로 분리합니다.
4. heap alert는 즉시 heap dump를 Git에 남기지 않습니다. 운영 채널에서 덤프 보관 위치와 개인정보 취급을 먼저 결정합니다.

## Redis instability

`RedisFallbacksHigh`와 `RedisOperationErrors`는 Redis 선택 계층이 불안정하거나 명령 실패가 지속된다는 뜻입니다.

1. Grafana Redis Cache panel에서 feature와 operation label을 확인합니다.
2. `docker compose -p readmates -f compose.yml ps redis`로 Redis container health를 확인합니다.
3. `docker compose -p readmates -f compose.yml logs --tail=120 redis`로 restart, OOM, persistence error를 확인합니다.
4. rate-limit 관련 오류면 민감 엔드포인트 보호가 약해질 수 있으므로 HTTP 429/5xx 지표도 같이 확인합니다.
5. AI generation Redis alert는 [AI session generation runbook](ai-session-generation.md#redis-down)을 우선합니다.

## Notification backlog

`NotificationOutboxBacklogHigh`, `NotificationOutboxBacklogCritical`, `NotificationFailRateHigh`, `NotificationDeadLetters`는 notification outbox 또는 delivery pipeline이 밀리거나 실패한다는 뜻입니다.

1. Grafana Notification Dispatch dashboard에서 pending, failed, dead, latency p95를 확인합니다.
2. `docker compose -p readmates -f compose.yml logs --tail=200 readmates-api | grep -i notification`으로 relay/consumer 로그를 확인합니다.
3. DB에서 source-of-truth 상태를 확인합니다: `SELECT status, count(*) FROM notification_deliveries GROUP BY status;`
4. dead-letter가 있으면 `notification_deliveries.status='DEAD'` row의 event type, updated time, retry metadata를 확인합니다. 본문이나 수신자 개인정보를 ticket/chat/log에 복사하지 않습니다.
5. 외부 email provider 장애가 의심되면 provider console과 Alertmanager SMTP 상태를 분리해서 봅니다.
```

- [ ] **Step 5: Update runbook index and public repo safety docs**

In `docs/operations/runbooks/README.md`, the Observability bootstrap entry must read:

```markdown
- [Observability bootstrap](observability-bootstrap.md) — OCI VM에서 Prometheus + Alertmanager + Grafana를 처음 올리는 초기 설정과 smoke check.
```

In `docs/deploy/security-public-repo.md`, update the observability secrets paragraph and table:

```markdown
Prometheus/Alertmanager/Grafana 자체는 자격증명을 git에 두지 않는다. SMTP receiver와 Grafana admin credential은 env로만 주입된다.
```

Add rows:

```markdown
| `READMATES_GRAFANA_ADMIN_USER` | Grafana admin user | `readmates` |
| `READMATES_GRAFANA_ADMIN_PASSWORD` | Grafana admin password | — |
```

Update the scanner sentence:

```markdown
`scripts/public-release-check.sh`가 `deploy/oci/{prometheus,alertmanager,grafana}/`, `ops/prometheus/alerts/`에 예시값이 아닌 이메일 도메인이나 IPv4 literal이 들어오면 fail시킨다. Prometheus target은 docker network DNS(`readmates-api:8081`, `alertmanager:9093`)만 사용한다. Grafana는 운영 VM의 `127.0.0.1:3001`에만 바인딩하고 SSH tunnel로 접근한다.
```

- [ ] **Step 6: Extend public release scanner to Grafana config**

In `scripts/public-release-check.sh`, update `scan_observability_targets()` so `observability_targets` includes:

```bash
local observability_targets=(
  "$source_abs/deploy/oci/prometheus"
  "$source_abs/deploy/oci/alertmanager"
  "$source_abs/deploy/oci/grafana"
  "$source_abs/ops/prometheus/alerts"
)
```

- [ ] **Step 7: Replace inactive alert documentation gaps**

In `docs/operations/observability/alerts.md`:

1. Replace the rule-writing bullet that currently permits missing runbook links with:

```markdown
- annotations에는 가능한 경우 `runbook_url`을 둔다. runbook이 없는 alert는 운영 알림으로 승격하기 전에 이 문서나 `docs/operations/runbooks/`에 triage 절차를 먼저 추가한다.
```

2. Replace every inactive `runbook:` example in the YAML reference block with the relevant `runbook_url` value:

```yaml
runbook_url: "https://github.com/${READMATES_REPO}/blob/main/docs/operations/runbooks/observability-bootstrap.md#notification-backlog"
```

for notification alerts,

```yaml
runbook_url: "https://github.com/${READMATES_REPO}/blob/main/docs/operations/runbooks/observability-bootstrap.md#http-error-or-latency"
```

for HTTP alerts,

```yaml
runbook_url: "https://github.com/${READMATES_REPO}/blob/main/docs/operations/runbooks/observability-bootstrap.md#jvm-and-db-pool"
```

for Hikari/JVM alerts, and

```yaml
runbook_url: "https://github.com/${READMATES_REPO}/blob/main/docs/operations/runbooks/observability-bootstrap.md#redis-instability"
```

for Redis alerts.

3. Replace the `## 후속` list with:

```markdown
## 후속

- Alertmanager receiver를 운영 SMTP 또는 팀 알림 채널에 연결한다.
- 한 달치 production data가 쌓이면 false positive와 threshold를 조정한다.
- `node-exporter`, `cadvisor`, `blackbox-exporter`는 production v1 이후 별도 계획으로 추가한다.
```

- [ ] **Step 8: Run documentation and safety checks**

Run:

```bash
git diff --check -- \
  docs/operations/runbooks/observability-bootstrap.md \
  docs/operations/runbooks/README.md \
  docs/deploy/security-public-repo.md \
  docs/operations/observability/alerts.md \
  scripts/public-release-check.sh
```

Expected: `git diff --check` exits `0`. The broader public-safety scan runs in Step 9.

- [ ] **Step 9: Run public release candidate check**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: public release check passes and gitleaks reports no leaks.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add docs/operations/runbooks/observability-bootstrap.md \
  docs/operations/runbooks/README.md \
  docs/deploy/security-public-repo.md \
  docs/operations/observability/alerts.md \
  scripts/public-release-check.sh
git diff --cached --check
git commit -m "docs: close observability alert runbooks"
```

Expected: commit succeeds and only Task 2 files are staged.

---

### Task 3: Final Verification And Production Smoke Handoff

**Files:**
- Modify: no source files expected unless Task 1 or Task 2 verification finds a defect.
- Evidence only: command outputs stay outside Git if they include private hostnames, IPs, credentials, object names, or deployment state.

**Interfaces:**
- Consumes: Task 1 deploy script and compose config; Task 2 runbooks.
- Produces: verified local release state and a clear production smoke path gated by private env availability.

- [ ] **Step 1: Confirm only intended files changed after Tasks 1 and 2**

Run:

```bash
git status --short --branch --untracked-files=all
```

Expected: clean working tree after Task 1 and Task 2 commits. If source files remain modified, inspect with `git diff --stat` and either commit the intended change in a focused fix commit or stop and report the unexpected file.

- [ ] **Step 2: Run full observability validation stack**

Run:

```bash
bash -n deploy/oci/06-deploy-observability-stack.sh \
  scripts/public-release-check.sh \
  scripts/validate-prometheus-config.sh \
  scripts/validate-prometheus-rules.sh \
  scripts/validate-alertmanager-config.sh
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-alertmanager-config.sh
```

Expected: all commands exit `0`; dashboard lint reports `3 dashboard(s) ok`; Prometheus and Alertmanager checks report success.

- [ ] **Step 3: Re-run compose config with generated local env**

Run:

```bash
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/readmates-compose-infra.XXXXXX")"
cp -R deploy/oci/. "$tmpdir/"
printf 'READMATES_ALERT_SMTP_HOST=smtp.example.com\nREADMATES_ALERT_SMTP_PORT=587\nREADMATES_ALERT_SMTP_USER=example-user\nREADMATES_ALERT_SMTP_PASSWORD=example-password\nREADMATES_ALERT_SMTP_FROM=alerts@example.com\nREADMATES_ALERT_EMAIL_TO=ops@example.com\n' > "$tmpdir/alertmanager.env"
printf 'GF_SECURITY_ADMIN_USER=readmates\nGF_SECURITY_ADMIN_PASSWORD=example-long-random-password\nGF_AUTH_ANONYMOUS_ENABLED=false\nGF_USERS_ALLOW_SIGN_UP=false\nGF_ANALYTICS_REPORTING_ENABLED=false\nGF_ANALYTICS_CHECK_FOR_UPDATES=false\n' > "$tmpdir/grafana.env"
docker compose -f "$tmpdir/compose.infra.yml" config >/tmp/readmates-compose-infra-config.out
grep -q 'grafana:' /tmp/readmates-compose-infra-config.out
grep -q '127.0.0.1:3001:3000' /tmp/readmates-compose-infra-config.out
rm -rf "$tmpdir"
```

Expected: all commands exit `0`.

- [ ] **Step 4: Run public release candidate check**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: candidate builds; public release check passes; gitleaks reports no leaks.

- [ ] **Step 5: Run production metrics/dashboard-first deploy only when private env is available**

Run this command only from a shell where `VM_PUBLIC_IP`, `SSH_KEY`, and `READMATES_GRAFANA_ADMIN_PASSWORD` are already set by the operator:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
: "${SSH_KEY:?set SSH_KEY in your shell}"
: "${READMATES_GRAFANA_ADMIN_PASSWORD:?set READMATES_GRAFANA_ADMIN_PASSWORD in your shell}"
READMATES_OBSERVABILITY_SERVICES="prometheus grafana" \
./deploy/oci/06-deploy-observability-stack.sh
```

Expected: script completes all stages, Prometheus is ready, Grafana is ready, and `readmates-server` target is `up`.

If the env guard fails, skip production deploy and report:

```text
Production deployment skipped because VM_PUBLIC_IP, SSH_KEY, or READMATES_GRAFANA_ADMIN_PASSWORD was not set in this shell.
```

- [ ] **Step 6: Run full Alertmanager deploy only when SMTP env is available**

Run this command only from a shell where all operator-provided env vars are set:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
: "${SSH_KEY:?set SSH_KEY in your shell}"
: "${READMATES_GRAFANA_ADMIN_PASSWORD:?set READMATES_GRAFANA_ADMIN_PASSWORD in your shell}"
: "${READMATES_ALERT_SMTP_HOST:?set READMATES_ALERT_SMTP_HOST in your shell}"
: "${READMATES_ALERT_SMTP_PORT:?set READMATES_ALERT_SMTP_PORT in your shell}"
: "${READMATES_ALERT_SMTP_USER:?set READMATES_ALERT_SMTP_USER in your shell}"
: "${READMATES_ALERT_SMTP_PASSWORD:?set READMATES_ALERT_SMTP_PASSWORD in your shell}"
: "${READMATES_ALERT_SMTP_FROM:?set READMATES_ALERT_SMTP_FROM in your shell}"
: "${READMATES_ALERT_EMAIL_TO:?set READMATES_ALERT_EMAIL_TO in your shell}"
./deploy/oci/06-deploy-observability-stack.sh
```

Expected: script completes all stages, Prometheus is ready, Alertmanager is ready, Grafana is ready, and `readmates-server` target is `up`.

If the env guard fails, skip Alertmanager deployment and report:

```text
Alertmanager deployment skipped because one or more READMATES_ALERT_* variables were not set in this shell.
```

- [ ] **Step 7: Verify Grafana tunnel after a successful production deploy**

Run:

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP in your shell}"
: "${SSH_KEY:?set SSH_KEY in your shell}"
ssh -i "$SSH_KEY" -L 13001:127.0.0.1:3001 "ubuntu@$VM_PUBLIC_IP"
```

In a local browser, open:

```text
http://localhost:13001
```

Expected: Grafana login screen opens. After login, the `ReadMates` folder contains the provisioned dashboards.

- [ ] **Step 8: Final status report**

Run:

```bash
git log --oneline -3
git status --short --branch --untracked-files=all
```

Expected: local verification commits are present and the working tree is clean. If production deploy was skipped because env was missing, explicitly report the skipped production command and the missing env guard. If production deploy ran, report only public-safe evidence such as service names and health state; do not paste private IPs, hostnames, SMTP values, or full target payloads into Git-tracked docs.
