# Observability Bootstrap

운영자가 OCI VM에서 Prometheus + Alertmanager + Grafana를 처음 띄울 때 따라가는 절차.

## 사전 준비

Alertmanager까지 같이 띄울 때는 SMTP 환경변수 6개를 준비합니다:

```
READMATES_ALERT_SMTP_HOST=smtp.example.com
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=example-user
READMATES_ALERT_SMTP_PASSWORD=example-password
READMATES_ALERT_SMTP_FROM=alerts@example.com
READMATES_ALERT_EMAIL_TO=ops@example.com
```

Grafana를 같이 띄울 때는 Git 밖 운영 채널에서 admin password를 정합니다:

```
READMATES_GRAFANA_ADMIN_USER=readmates
READMATES_GRAFANA_ADMIN_PASSWORD=example-long-random-password
```

## 로컬 smoke

운영 VM에 올리기 전에 로컬에서 dashboard/rule/provisioning이 깨지지 않았는지 확인합니다.

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
```

로컬 Spring Boot 서버가 `8081` management port를 열고 있으면 Prometheus target health까지 같이 확인합니다.
서버가 떠 있지 않은 상태에서는 target presence까지만 확인하고 실제 scrape health는 운영 bring-up 단계에서 확인합니다.

## Bring-up

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

## Smoke check

1. Target healthy: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -c '"health":"up"'` — full stack 기준 3 이상이어야 (readmates-api, prometheus-self, alertmanager). Prometheus + Grafana만 먼저 올린 경우에는 readmates-api와 prometheus-self가 up인지 확인한다.
2. Alertmanager ready: `docker compose -p readmates -f compose.infra.yml exec -T alertmanager wget -qO- http://localhost:9093/-/ready` — 200 OK.
3. Grafana ready: `docker compose -p readmates -f compose.infra.yml exec -T grafana wget -qO- http://localhost:3000/api/health` — 200 OK.
4. Rule load: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"'` — 최소 6 그룹.
5. Test alert: Prometheus expr 브라우저에서 `vector(1)`로 임시 룰 추가 또는 alertmanager API에 `amtool alert add` — 운영자 inbox 수신 확인. (구체 절차는 alertmanager 공식 docs 참조.)

## Trouble

- `up{job="readmates-server"} == 0`: app container가 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0` 설정인지, `readmates-api` service와 같은 compose project/network에 떠 있는지 확인.
- SMTP 실패: `docker logs readmates-alertmanager | grep 'failed to send email'`. SMTP 자격증명 / smarthost 확인.
- Grafana 접속 실패: VM 보안그룹을 열지 말고 SSH 터널 `-L 13001:127.0.0.1:3001`이 살아있는지, `docker compose -p readmates -f compose.infra.yml ps grafana`가 healthy인지 확인.
- Notification backlog alert: §`notification-backlog` 참고 — outbox 직접 SQL drill-down.

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

## 후속

- 1주 후 첫 SLO 측정치는 `slo-monthly-report.md` 절차로 `docs/operations/slo-reports/2026-06.md`에 기록.
