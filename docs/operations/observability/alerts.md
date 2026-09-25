# 알림 룰

> 운영 흐름은 [Observability README](README.md)에서 시작합니다. 배포 전후 검증은 [Deploy observability check](../runbooks/deploy-observability-check.md)를 따릅니다.

이 문서는 Prometheus alert rule을 사람이 읽기 쉽게 정리한 것입니다. 기준(SSOT)은 `ops/prometheus/alerts/*-rules.yml`입니다. 문서와 파일이 다르면 파일이 맞습니다. 운영 Prometheus가 실제로 어떤 룰을 로드했는지는 Git이 아니라 운영 환경에서 확인합니다.

## 룰 작성 규약

- 새 alert는 rules 파일 PR로 추가하고, 같은 PR에서 이 문서를 맞춥니다.
- 검증: `./scripts/validate-prometheus-rules.sh` (Docker의 promtool로 rule 문법과 `ops/prometheus/tests/*.test.yml` 단위 테스트 실행).
- severity: `critical` | `warning` | `info`. AI 세션 생성 룰(`aigen-rules.yml`)은 `warn` label을 씁니다.
- `for:`로 일시적 spike를 무시합니다.
- 메트릭 이름은 Prometheus 형식입니다. Micrometer의 `.`은 `_`로 바뀌고, counter에는 `_total`이 붙습니다.
- `runbook_url`은 현재 `NotificationOutboxBacklogHigh`와 `aigen-rules.yml`에만 있습니다. `${READMATES_REPO}`는 Prometheus가 치환하지 않으므로 링크는 참고용입니다.

## 알림 목록 (anchors)

<a id="notificationoutboxbackloghigh"></a>
<a id="notificationoutboxrelaydead"></a>
<a id="notificationdeliverybackloghigh"></a>
<a id="notificationdeadletters"></a>
<a id="notificationfailratehigh"></a>
<a id="httperrorratehigh"></a>
<a id="httplatencyp95high"></a>
<a id="hikariconnectionpoolpending"></a>
<a id="jvmheaphigh"></a>
<a id="ratelimitdenied"></a>
<a id="redisfallbackshigh"></a>
<a id="redisoperationerrors"></a>
<a id="scrapetargetdown"></a>
<a id="aigenprovidererrorburst"></a>
<a id="aigenschemafailurespike"></a>
<a id="aigenbudgetexhaustion"></a>
<a id="aigenqueuelaghigh"></a>
<a id="aigenqueueprobeunavailable"></a>
<a id="aigenqueueprobestale"></a>
<a id="aigenrecoveryfailure"></a>
<a id="aigenrecoveryindexrepairblocked"></a>
<a id="aigenredisdown"></a>
<a id="aigenprovidercircuitopen"></a>
<a id="aigenestimatedunknowncostgrowth"></a>
<a id="aigenphysicalcallcapexhausted"></a>
<a id="aigenotlpexporterdrops"></a>
<a id="tempotargetdown"></a>
<a id="temponotready"></a>

## 파일화된 AI 세션 생성 룰

`ops/prometheus/alerts/aigen-rules.yml`의 alert입니다. `runbook_url`은 [AI session generation runbook](../runbooks/ai-session-generation.md)의 anchor를 가리킵니다.

| Alert | Severity | 기준 | Runbook anchor |
| --- | --- | --- | --- |
| `AiGenProviderErrorBurst` | warn | provider별 `FAILED` job 비율 > 10% (10m) | `#provider-error-burst` |
| `AiGenSchemaFailureSpike` | warn | `SCHEMA_INVALID` validation failure 비율 > 20% (1h) | `#schema-failure-spike` |
| `AiGenBudgetExhaustion` | info | 전체 30일 AI 비용 > $1000 | `#budget-exhaustion` |
| `AiGenQueueLagHigh` | warn | probe가 authoritative/fresh일 때 processing backlog > 50 (5m) | `#queue-lag-high` |
| `AiGenQueueProbeUnavailable` | warn | availability가 0이거나 series 없음 (2m) | `#queue-probe-unavailable` |
| `AiGenQueueProbeStale` | warn | last-success가 없음/NaN 또는 sample interval 3배 이상 지남 (2m) | `#queue-probe-unavailable` |
| `AiGenRecoveryFailure` | warn | 10m 내 recovery `failed`/`corrupt` 증가 또는 nonzero series 첫 관측 | `#recovery-failure` |
| `AiGenRecoveryIndexRepairBlocked` | warn | repair `quarantined`/`over_cap`/`failed` 증가 또는 nonzero series 첫 관측 | `#recovery-index-repair` |
| `AiGenRedisDown` | critical | `redis_up == 0` 이면서 HTTP 5xx > 1 req/s (1m) | `#redis-down` |
| `AiGenProviderCircuitOpen` | warn | `resilience4j_circuitbreaker_state{state="open"}` 5m 유지 | `#provider-circuit-open` |
| `AiGenEstimatedUnknownCostGrowth` | warn | 15m 동안 `ESTIMATED_UNKNOWN` 비용 증가 | `#estimated-unknown-cost` |
| `AiGenPhysicalCallCapExhausted` | warn | 최대 3회 물리 호출 cap 소진 (10m) | `#physical-call-cap` |
| `AiGenOtlpExporterDrops` | warn | OTLP export 실패 또는 bounded queue drop (10m) | `#otlp-exporter-drops` |
| `TempoTargetDown` | critical | `up{job="tempo"} == 0` (2m) | `#tempo-down` |
| `TempoNotReady` | critical | ACTIVE Tempo ingester 없음 (2m) | `#tempo-not-ready` |

- Club별 비용 cap은 alert가 아닙니다. `club_id`를 metric label로 쓰지 않으므로 application cap guard와 `ai_generation_audit_log` SQL로 확인합니다.
- `AiGenRedisDown`의 `redis_up`은 현재 repo의 scrape 대상(`readmates-server`, `prometheus-self`, `alertmanager`, `tempo`)이 내보내지 않습니다. Redis exporter를 붙이기 전에는 이 alert가 울리지 않는다고 보고, Redis 상태는 `RedisFallbacksHigh`/`RedisOperationErrors`와 `/admin/health`로 확인합니다.
- Exporter 실패나 Tempo down은 product 장애와 같지 않습니다.

## 기타 룰 (파일화 완료)

| Alert | 파일 | Severity | 조건 | for |
| --- | --- | --- | --- | --- |
| `NotificationOutboxBacklogHigh` | `notification-rules.yml` | warning | `max(readmates_notifications_outbox_backlog{status="pending"}) > 100` | 10m |
| `NotificationOutboxBacklogCritical` | `notification-rules.yml` | critical | 같은 식 `> 1000` | 5m |
| `NotificationFailRateHigh` | `notification-rules.yml` | warning | failed / (sent + failed) > 5% (5m rate, 아래 참고) | 10m |
| `NotificationDeadLetters` | `notification-rules.yml` | warning | `increase(readmates_notifications_dead_total[1h]) > 0` | 0m |
| `NotificationOutboxRelayDead` | `notification-rules.yml` | warning | `max(readmates_notifications_outbox_backlog{status="dead"}) > 0` | 0m |
| `NotificationDeliveryBacklogHigh` | `notification-rules.yml` | warning | `max(readmates_notifications_delivery_backlog{status=~"pending\|failed\|sending"}) > 100` | 10m |
| `HttpErrorRateHigh` | `http-rules.yml` | critical | 전체 5xx 비율 > 1% (분모 `clamp_min(..., 1)`) | 5m |
| `HttpLatencyP95High` | `http-rules.yml` | warning | `/api/.*` uri별 p95 > 0.5s | 10m |
| `HikariConnectionPoolPending` | `jvm-rules.yml` | warning | `hikaricp_connections_pending > 0` | 2m |
| `JvmHeapHigh` | `jvm-rules.yml` | warning | heap used / max > 85% | 10m |
| `RateLimitDenied` | `security-rules.yml` | warning | `sum(rate(readmates_rate_limit_denied_total{sensitive="true"}[5m])) > 0.1` | 5m |
| `RedisFallbacksHigh` | `redis-rules.yml` | warning | `sum(rate(readmates_redis_fallbacks_total[5m])) > 0.1` | 5m |
| `RedisOperationErrors` | `redis-rules.yml` | warning | `sum(rate(readmates_redis_operation_errors_total[5m])) > 0.05` | 5m |
| `ScrapeTargetDown` | `targets-rules.yml` | critical | `up == 0` | 5m |

해석 메모:

- `HttpLatencyP95High`는 `http_server_requests_seconds_bucket`이 필요합니다. 현재 `application.yml`에는 `http.server.requests` histogram 설정이 없어 bucket series가 없을 수 있습니다. 먼저 [메트릭 카탈로그의 HTTP 절](metrics-catalog.md#http)을 확인합니다.
- Outbox 룰(`NotificationOutboxBacklog*`, `NotificationOutboxRelayDead`)은 event relay/Kafka 발행 경보입니다. Delivery 룰(`NotificationDeliveryBacklogHigh`, `NotificationDeadLetters`, `NotificationFailRateHigh`)은 SMTP 발송 경보입니다. 두 queue를 같은 것으로 보지 않습니다.
- `NotificationFailRateHigh`는 `failed`/`sent`가 없으면 `or vector(0)`으로 0을 채우고, 분모에 `1e-9` floor를 둡니다. 저빈도 구간에서 실패 1건뿐이면 비율 1.0으로 alert가 유지됩니다. 성공만 있거나 series가 없으면 0입니다. Prometheus query 자체가 실패하면 별도 장애로 봅니다.
- Backlog gauge가 첫 refresh 전 `NaN`이거나 refresh 결과가 `partial|failure`면 0건이 아닙니다. 마지막 성공 snapshot과 `readmates_notifications_backlog_refresh_total`을 먼저 봅니다.

## DB 기반 점검 (Prometheus 외)

DEAD delivery를 DB에서 직접 확인할 때:

```sql
SELECT count(*) FROM notification_deliveries
WHERE status = 'DEAD' AND updated_at > NOW() - INTERVAL 24 HOUR;
```

count > 0이면 조사합니다. 상태 컬럼은 `status`입니다(`state` 컬럼은 없음).

## 알림 전달

Alertmanager 설정은 `deploy/oci/alertmanager/alertmanager.yml`입니다. severity별로 묶어 단일 SMTP receiver(`ops-email`)로 보냅니다. SMTP 계정과 수신자는 환경 변수로 주입하며 Git에 두지 않습니다.

## 후속

- 운영 데이터가 한 달 이상 쌓이면 false positive와 threshold를 조정합니다.
- `node-exporter`, `cadvisor`, `blackbox-exporter`, Redis exporter는 아직 없습니다.
