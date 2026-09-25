# Observability Bootstrap

OCI VM에 Tempo + Prometheus + Alertmanager + Grafana를 처음 올리는 절차와, 공통 알림이 울렸을 때의 1차 대응입니다.

- 배포 스크립트: `deploy/oci/06-deploy-observability-stack.sh`
- compose 파일: `deploy/oci/compose.infra.yml` (VM에서는 `/opt/readmates/deploy/oci/compose.infra.yml`, project `readmates`)
- rule/dashboard 원본: `ops/prometheus/alerts/`, `ops/grafana/dashboards/`, `ops/tempo/tempo.yml`

VM에서 쓰는 명령이 길어서 아래처럼 줄여 씁니다.

```bash
# VM에서
INFRA='sudo docker compose -p readmates -f /opt/readmates/deploy/oci/compose.infra.yml'
APP='sudo docker compose -f /opt/readmates/compose.yml'
```

## 사전 준비

Alertmanager를 올릴 때는 SMTP 환경변수 6개가 필요합니다(값은 예시).

```bash
READMATES_ALERT_SMTP_HOST=smtp.example.com
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=example-user
READMATES_ALERT_SMTP_PASSWORD=example-password
READMATES_ALERT_SMTP_FROM=alerts@example.com
READMATES_ALERT_EMAIL_TO=ops@example.com
```

Grafana를 올릴 때는 admin password를 Git 밖에서 정합니다. user 기본값은 `readmates`입니다.

```bash
READMATES_GRAFANA_ADMIN_USER=readmates
READMATES_GRAFANA_ADMIN_PASSWORD=<long-random-password>
```

## 로컬 smoke

VM에 올리기 전에 로컬에서 rule, dashboard, provisioning을 확인합니다.

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
```

로컬 Spring 서버가 management port `8081`을 열고 있으면 target health까지 확인됩니다. 서버가 없으면 target 등록까지만 확인되고, 실제 scrape health는 VM bring-up에서 봅니다.

## Bring-up

기본은 네 서비스(`tempo prometheus alertmanager grafana`)를 모두 올립니다. 스크립트는 로컬 검증 → 파일 전송 → `up -d` → smoke(Tempo ready, Prometheus ready, rule 로드, `readmates-server` target up) 순서로 진행합니다.

```bash
: "${VM_PUBLIC_IP:?set VM_PUBLIC_IP}"
: "${READMATES_GRAFANA_ADMIN_PASSWORD:?set READMATES_GRAFANA_ADMIN_PASSWORD}"
./deploy/oci/06-deploy-observability-stack.sh
```

email 알림은 나중에 붙이려면 Alertmanager를 빼고 올립니다. 이때 스크립트는 `deploy/oci/prometheus/prometheus.no-alertmanager.yml`을 보냅니다.

```bash
READMATES_OBSERVABILITY_SERVICES="tempo prometheus grafana" \
./deploy/oci/06-deploy-observability-stack.sh
```

- 선택 env: `SSH_KEY`, `REMOTE_USER`(기본 `ubuntu`), `READMATES_SKIP_OBSERVABILITY_VALIDATE=true`(로컬 검증 생략).
- email 알림을 붙일 때는 SMTP env를 채우고 기본값(전체)으로 다시 실행합니다.

VM에서 직접 올릴 때(파일이 이미 설치된 경우):

```bash
$INFRA up -d tempo prometheus alertmanager grafana
```

Grafana는 VM `127.0.0.1:3001`에만 바인딩됩니다. 보안그룹을 열지 말고 SSH 터널로 봅니다.

```bash
ssh -i <deploy-ssh-key> -L 13001:127.0.0.1:3001 ubuntu@<vm-public-ip>
# 로컬 브라우저: http://localhost:13001
```

## Smoke check

VM에서 확인합니다.

1. Target: `$INFRA exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -o '"health":"up"' | wc -l`
   - 전체 stack: 4 (`readmates-server`, `prometheus-self`, `alertmanager`, `tempo`)
   - Alertmanager 없이: 3
2. Alertmanager: `$INFRA exec -T alertmanager wget -qO- http://localhost:9093/-/ready`
3. Grafana: `$INFRA exec -T grafana wget -qO- http://localhost:3000/api/health`
4. Tempo: `$INFRA exec -T prometheus wget -qO- http://tempo:3200/ready`
5. Rule: `$INFRA exec -T prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -o '"type":"alerting"' | wc -l`가 0보다 커야 합니다. rule group은 7개(`readmates.http`, `readmates.jvm`, `readmates.notification`, `readmates.security`, `readmates.targets`, `readmates.redis`, `aigen`)입니다.
6. 알림 수신: Alertmanager API로 테스트 알림을 보내 운영자 inbox에 오는지 봅니다. 방법은 Alertmanager 공식 문서(`amtool alert add`)를 따릅니다.

## Trouble

- `up{job="readmates-server"} == 0`: app 컨테이너에 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0`이 있는지(`deploy/oci/compose.yml`), `readmates-api`가 같은 compose project/network에 있는지 확인합니다.
- SMTP 실패: `$INFRA logs --tail=200 alertmanager | grep -i 'failed to send'`. SMTP 자격증명과 smarthost를 확인합니다.
- Grafana 접속 실패: SSH 터널이 살아 있는지, `$INFRA ps grafana`가 healthy인지 봅니다.

## Target down

`ScrapeTargetDown`은 Prometheus가 5분 동안 target을 scrape하지 못했다는 뜻입니다.

1. `$INFRA ps`와 `$APP ps`로 `readmates-api`, `prometheus`, `alertmanager`, `grafana`, `tempo` 상태를 봅니다.
2. `$INFRA logs --tail=120 prometheus`로 scrape 오류를 봅니다.
3. `readmates-server`만 down이면 app 쪽 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0`, `READMATES_MANAGEMENT_PORT=8081`, `readmates-api` health를 확인합니다.
4. `tempo`만 down이면 [AI session generation runbook](ai-session-generation.md#tempo-down)을 봅니다.
5. 모든 target이 down이면 VM이나 Docker daemon 장애일 가능성이 큽니다. [Post-deploy watch](post-deploy-watch.md)와 [Read-only diagnostics](read-only-diagnostics.md)로 넘어갑니다.

## HTTP error or latency

`HttpErrorRateHigh`(5xx 비율 1% 초과, 5분)와 `HttpLatencyP95High`(`/api/*` p95 500ms 초과, 10분)는 사용자 API가 실패하거나 느리다는 신호입니다.

1. Prometheus에서 5xx 비율과 URI별 p95를 확인합니다. BFF 쪽은 Grafana `BFF -> API Latency`, 프론트는 `Frontend Runtime` dashboard를 봅니다.
2. 배포 직후라면 [deploy ledger](deploy-attempts.md)와 post-deploy watch 결과를 먼저 봅니다.
3. `requestId`나 시간대로 [Correlation ID lookup](correlation-id-lookup.md)을 실행합니다.
4. Hikari pending, JVM heap, Redis error, notification backlog 중 함께 오른 지표를 찾아 병목을 좁힙니다.
5. 원인이 최근 배포이고 영향이 계속되면 [OCI Compose Stack](../../deploy/compose-stack.md#rollback)의 rollback을 따릅니다.

## JVM and DB pool

`HikariConnectionPoolPending`(pending > 0, 2분)은 DB connection을 기다리는 요청이 있다는 뜻이고, `JvmHeapHigh`는 heap 사용률이 10분 동안 85%를 넘었다는 뜻입니다. 전용 dashboard는 없으므로 Prometheus에서 봅니다.

1. `hikaricp_connections_pending`, `hikaricp_connections_active`, `hikaricp_connections_idle`, `jvm_memory_used_bytes{area="heap"}`와 HTTP p95를 함께 봅니다.
2. `$APP logs --tail=200 readmates-api`로 timeout, slow query, GC 관련 로그를 봅니다.
3. pending이 계속되면 신규 배포, 배치 작업, notification relay 증가, DB 장애를 차례로 분리합니다.
4. heap dump는 Git에 남기지 않습니다. 보관 위치와 개인정보 취급을 운영 채널에서 먼저 정합니다.

## Redis instability

`RedisFallbacksHigh`와 `RedisOperationErrors`는 Redis 계층이 불안정하거나 명령 실패가 계속된다는 뜻입니다.

1. Prometheus에서 `readmates_redis_fallbacks_total`, `readmates_redis_operation_errors_total`을 feature/operation label별로 봅니다.
2. `$APP ps redis`로 Redis 컨테이너 health를 봅니다.
3. `$APP logs --tail=120 redis`로 restart, OOM, persistence 오류를 봅니다.
4. rate-limit 관련 오류면 민감 엔드포인트 보호가 약해질 수 있으니 HTTP 429/5xx도 함께 봅니다.
5. AI 생성 쪽 Redis 문제는 [AI session generation runbook](ai-session-generation.md#redis-down)을 먼저 봅니다.

## Notification backlog

`NotificationOutboxBacklogHigh`, `NotificationOutboxBacklogCritical`, `NotificationOutboxRelayDead`, `NotificationDeliveryBacklogHigh`, `NotificationFailRateHigh`, `NotificationDeadLetters`는 알림 outbox나 delivery가 밀리거나 실패한다는 뜻입니다.

1. Grafana `Notification Dispatch` dashboard에서 event outbox/email delivery backlog, DEAD 수, publish 성공률을 봅니다.
2. `$APP logs --tail=200 readmates-api | grep -i notification`으로 relay/consumer 로그를 봅니다.
3. DB에서 실제 상태를 셉니다.

   ```sql
   SELECT status, count(*) FROM notification_event_outbox GROUP BY status;
   SELECT status, count(*) FROM notification_deliveries GROUP BY status;
   ```

4. `DEAD`가 있으면 event type, `updated_at`, attempt/retry metadata만 봅니다. 본문이나 수신자 개인정보를 ticket/채팅/로그에 복사하지 않습니다. 복구 경로는 [Correlation ID lookup](correlation-id-lookup.md#delivery-복구-경로)을 봅니다.
5. 외부 email provider 장애가 의심되면 provider console과 Alertmanager SMTP 상태를 따로 봅니다.

## 후속

- 매월 SLO 측정은 [SLO monthly report](slo-monthly-report.md)를 따릅니다.
