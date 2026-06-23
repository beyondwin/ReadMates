# 알림 룰 후보

> 운영 흐름으로 읽으려면 [Observability README](README.md)에서 시작하고, 배포 전후 검증은 [Deploy observability check](../runbooks/deploy-observability-check.md)를 기준으로 기록합니다.

본 문서는 Prometheus alert rule 정의를 사람-읽기용으로 정리합니다. 모든 룰은 `ops/prometheus/alerts/{notification,http,jvm,security,redis,targets,aigen}-rules.yml`에 파일화되어 Prometheus가 실제로 로드하며, SSOT는 rules 디렉토리입니다(아래 "룰 (파일화 완료)" 참조). 실 배포 여부는 운영 환경에서 별도 확인합니다.

## 룰 작성 규약

- severity: `critical` | `warning` 또는 `warn` | `info`. 기존 후보 룰은 `warning`, 파일화된 AI 세션 생성 룰은 현재 `warn` label을 씁니다.
- `for:`로 일시적 spike 무시.
- annotations에 runbook 링크 (runbook 미작성 시 `TBD`).
- prod-only로 적용 가정. dev/staging은 룰 별도 set.
- 메트릭 이름은 Prometheus exposition 형식 (Micrometer의 dot → underscore, counter에 `_total` 접미).

## 알림 목록 (anchors)

<a id="notificationoutboxbackloghigh"></a>
<a id="notificationdeadletters"></a>
<a id="notificationfailratehigh"></a>
<a id="httperrorratehigh"></a>
<a id="httplatencyp95high"></a>
<a id="hikariconnectionpoolpending"></a>
<a id="jvmheaphigh"></a>
<a id="ratelimitdenied"></a>
<a id="redisfallbackshigh"></a>
<a id="redisoperationerrors"></a>
<a id="aigenprovidererrorburst"></a>
<a id="aigenschemafailurespike"></a>
<a id="aigenbudgetexhaustion"></a>
<a id="aigenqueuelaghigh"></a>
<a id="aigenredisdown"></a>

## 파일화된 AI 세션 생성 룰

`ops/prometheus/alerts/aigen-rules.yml`은 in-app AI 세션 생성 운영용으로 다음 alert를 정의합니다. 각 alert의 `runbook_url`은 [AI session generation runbook](../runbooks/ai-session-generation.md)의 anchor로 연결됩니다.

| Alert | Severity | 기준 | Runbook anchor |
| --- | --- | --- | --- |
| `AiGenProviderErrorBurst` | warn | provider별 FAILED job ratio > 10% over 10m | `#provider-error-burst` |
| `AiGenSchemaFailureSpike` | warn | `SCHEMA_INVALID` validation failure ratio > 20% over 1h | `#schema-failure-spike` |
| `AiGenBudgetExhaustion` | info | aggregate 30d AI generation cost > $1000 | `#budget-exhaustion` |
| `AiGenQueueLagHigh` | warn | Redis active AI job backlog `readmates_aigen_queue_depth > 50` for 5m | `#queue-lag-high` |
| `AiGenRedisDown` | critical | `redis_up == 0` and HTTP 5xx rate elevated | `#redis-down` |

Per-club cost cap은 metric label에 `club_id`를 싣지 않는 정책 때문에 Prometheus alert가 아니라 application cap guard와 `ai_generation_audit_log` SQL drill-down으로 운영합니다.

신규 dead-target watch는 `ops/prometheus/alerts/targets-rules.yml`의 `ScrapeTargetDown` (`up == 0` for 5m) 으로 모든 scrape target(`readmates-server`, `prometheus-self`, `alertmanager`)이 사라지면 critical alert를 띄웁니다.

## 룰 (파일화 완료)

본 문서의 후보 룰들은 모두 `ops/prometheus/alerts/{notification,http,jvm,security,redis,targets}-rules.yml`에
파일화되어 Prometheus가 실제로 로드한다. 본 문서는 사람-읽기용 참고이며 SSOT는 rules 디렉토리다.
새 alert 추가는 항상 rules 디렉토리 파일 PR로 한다 — docs는 그 PR과 함께 동기화한다.

```yaml
groups:
  - name: readmates.notification
    interval: 30s
    rules:
      - alert: NotificationOutboxBacklogHigh
        expr: max(readmates_notifications_outbox_backlog{status="pending"}) > 100
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Notification pending backlog over 100 for 10 minutes"
          description: "Consumer가 처리 속도를 따라가지 못하거나 죽었을 가능성. consumer 로그 확인."
          runbook: "TBD - docs/operations/runbooks/notification-backlog.md"

      - alert: NotificationOutboxBacklogCritical
        expr: max(readmates_notifications_outbox_backlog{status="pending"}) > 1000
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "Notification pending backlog over 1000"
          description: "Consumer가 죽었거나 의존 인프라가 unreachable. 즉시 조사."
          runbook: "TBD"

      - alert: NotificationFailRateHigh
        expr: |
          sum(rate(readmates_notifications_failed_total[5m]))
            / clamp_min(sum(rate(readmates_notifications_sent_total[5m]))
                       + sum(rate(readmates_notifications_failed_total[5m])), 1) > 0.05
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Notification 실패율 5% 초과 (10분)"
          description: "발송 실패가 지속. 외부 채널(예: FCM) 장애 또는 payload 변경 의심."
          runbook: "TBD"

      - alert: NotificationDeadLetters
        expr: increase(readmates_notifications_dead_total[1h]) > 0
        for: 0m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Notification dead-letter 발생 (1시간 내)"
          description: "발송이 최종 포기된 알림이 있습니다. notification_deliveries.status='DEAD' 로우 조사."
          runbook: "TBD"

  - name: readmates.http
    interval: 30s
    rules:
      - alert: HttpErrorRateHigh
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            / clamp_min(sum(rate(http_server_requests_seconds_count[5m])), 1) > 0.01
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "HTTP 5xx ratio over 1% for 5 minutes"
          description: "에러 폭증. 최근 배포 / 외부 의존 의심."
          runbook: "TBD"

      - alert: HttpLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum by (le, uri) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*"}[5m])))
            > 0.5
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "p95 latency over 500ms for 10 minutes"
          description: "DB slow query, GC pause, Hikari 부족 등 의심. Service Health dashboard 확인."

  - name: readmates.jvm
    interval: 30s
    rules:
      - alert: HikariConnectionPoolPending
        expr: hikaricp_connections_pending > 0
        for: 2m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Hikari connection pool에 대기 요청 누적 (2분)"
          description: "Pool size 부족 또는 long-running query. slow query log 확인."

      - alert: JvmHeapHigh
        expr: |
          jvm_memory_used_bytes{area="heap"}
            / jvm_memory_max_bytes{area="heap"} > 0.85
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "JVM heap 사용률 85% 초과 (10분)"
          description: "Memory leak 또는 GC 비효율. heap dump 검토 후보."

  - name: readmates.security
    interval: 30s
    rules:
      - alert: RateLimitDenied
        expr: sum(rate(readmates_rate_limit_denied_total{sensitive="true"}[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "민감 엔드포인트 rate-limit 차단 발생 (5m 평균 > 0.1/s)"
          description: "지속적인 abuse 시도 가능. IP/계정 패턴 조사."
          runbook: "TBD"

  - name: readmates.redis
    interval: 30s
    rules:
      - alert: RedisFallbacksHigh
        expr: sum(rate(readmates_redis_fallbacks_total[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Redis fallback 발생률 > 0.1/s (5분)"
          description: "Redis 불안정 또는 연결 문제. Redis 자체 로그 + 노드 상태 확인."
          runbook: "TBD"

      - alert: RedisOperationErrors
        expr: sum(rate(readmates_redis_operation_errors_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Redis 명령 실행 오류율 > 0.05/s (5분)"
          description: "특정 어댑터/명령에서 오류 지속. 영향 범위 파악."
          runbook: "TBD"
```

## DB 기반 알림 (Prometheus 외)

DEAD state notification delivery 외 별도 무결성 검증이 필요한 경우 cron + 쿼리로 감시:

```sql
SELECT count(*) FROM notification_deliveries
WHERE status = 'DEAD' AND updated_at > NOW() - INTERVAL 24 HOUR;
```

count > 0이면 운영자에게 알림 (이메일 또는 in-app).

> 참고: `notification_deliveries.status` 컬럼명을 사용 (메트릭 카탈로그와 동일). `notification_deliveries.state` 컬럼은 존재하지 않는다.

## 후속

- 위 룰을 `prometheus/rules/`에 yaml로 commit + alertmanager 설정 plan.
- 알림 채널 (이메일, Slack, Telegram 등) 설정.
- Runbook 작성 (각 alert별 대응 절차).
