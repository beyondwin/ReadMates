# 메트릭 카탈로그

> 운영 흐름으로 읽으려면 [Observability README](README.md)에서 시작하고, 배포 전후 검증은 [Deploy observability check](../runbooks/deploy-observability-check.md)를 기준으로 기록합니다.

## 노출 endpoint

`GET http://<server-host>:8081/actuator/prometheus` — Prometheus exposition 형식.

관리 서버는 `READMATES_MANAGEMENT_ADDRESS`(기본값 `127.0.0.1`) 와 `READMATES_MANAGEMENT_PORT`(기본값 `8081`)로 바인딩된다. 기본 설정은 루프백 전용이므로 외부에서 직접 접근할 수 없다. 공개 포트가 필요한 경우 reverse proxy에서 별도 보호를 추가해야 한다. 설정 근원: `server/src/main/resources/application.yml` (`management.server.address`, `management.server.port`).

모든 메트릭에는 공통 태그 `application=readmates-server`가 자동 부착된다 (`management.metrics.tags.application`).

## Custom 메트릭

| 이름 | 타입 | 라벨 | 단위 | 의미 | 근원 코드 | 패널 | 알림 |
|------|------|------|------|------|----------|------|------|
| `readmates.notifications.outbox.backlog` | gauge | `status` (`pending` / `failed` / `dead` / `sending`) | 행수 | status별 notification_deliveries 적체 행 수. 60초 캐시(CachedNotificationBacklogProvider 스케줄러). | `server/.../ReadmatesOperationalMetrics.kt`, `server/.../CachedNotificationBacklogProvider.kt` | dashboards.md#notification-pipeline | alerts.md#notificationoutboxbackloghigh |
| `readmates.notifications.sent` | counter | `event_type` (NotificationEventType enum) | 건수 | 알림 발송 성공 건수. 트랜잭션 커밋 후 증가. | `server/.../ReadmatesOperationalMetrics.kt` | dashboards.md#notification-pipeline | — |
| `readmates.notifications.failed` | counter | `event_type` (NotificationEventType enum) | 건수 | 알림 발송 실패(재시도 가능) 건수. | `server/.../ReadmatesOperationalMetrics.kt` | dashboards.md#notification-pipeline | alerts.md#notificationfailratehigh |
| `readmates.notifications.dead` | counter | `event_type` (NotificationEventType enum) | 건수 | 알림 발송 포기(dead-letter) 건수. | `server/.../ReadmatesOperationalMetrics.kt` | dashboards.md#notification-pipeline | alerts.md#notificationdeadletters |
| `readmates.notifications.delivery.latency` | timer/histogram | `event_type` (NotificationEventType enum) | 초 | notification_event_outbox row 생성 → `PUBLISHED` 전환까지 latency. SLO 버킷(10s/30s/1m/5m/15m) 포함. | `server/.../ReadmatesOperationalMetrics.kt` | dashboards.md#notification-pipeline | slos.md#notification_delivery_latency_p95 |
| `readmates.feedback.uploads` | counter | `result` (`success` / `failure`) | 건수 | 피드백 파일 업로드 결과. success는 트랜잭션 커밋 후 증가. | `server/.../ReadmatesOperationalMetrics.kt` | — | — |
| `readmates.notes_cache.hit` | counter | `scope` | 건수 | Notes Redis 캐시 적중 횟수. | `server/.../RedisNotesReadCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.notes_cache.miss` | counter | `scope` | 건수 | Notes Redis 캐시 미스 횟수. | `server/.../RedisNotesReadCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.notes_cache.evicted` | counter | `scope` | 건수 | Notes Redis 캐시 강제 제거(무효화) 횟수. | `server/.../RedisReadCacheInvalidationAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.public_cache.hit` | counter | `scope` | 건수 | Public read Redis 캐시 적중 횟수. | `server/.../RedisPublicReadCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.public_cache.miss` | counter | `scope` | 건수 | Public read Redis 캐시 미스 횟수. | `server/.../RedisPublicReadCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.public_cache.evicted` | counter | `scope` | 건수 | Public read Redis 캐시 강제 제거(무효화) 횟수. | `server/.../RedisReadCacheInvalidationAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.auth_session_cache.hit` | counter | (없음) | 건수 | Auth session Redis 캐시 적중 횟수. | `server/.../RedisAuthSessionCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.auth_session_cache.miss` | counter | (없음) | 건수 | Auth session Redis 캐시 미스 횟수. | `server/.../RedisAuthSessionCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.auth_session_cache.evicted` | counter | `scope` (`session` / `user`) | 건수 | Auth session Redis 캐시 강제 제거 횟수. scope별로 세션 단위/사용자 단위 구분. | `server/.../RedisAuthSessionCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.auth_session_touch.skipped` | counter | (없음) | 건수 | Auth session TTL 갱신을 조기 종료한 횟수(중복 touch 방지 최적화). | `server/.../RedisAuthSessionCacheAdapter.kt` | dashboards.md#redis-cache | — |
| `readmates.rate_limit.allowed` | counter | `sensitive` (`true` / `false`) | 건수 | Rate limit 체크 통과 건수. sensitive=true는 민감 엔드포인트. | `server/.../RedisRateLimitAdapter.kt` | — | — |
| `readmates.rate_limit.denied` | counter | `sensitive` (`true` / `false`) | 건수 | Rate limit 차단 건수. | `server/.../RedisRateLimitAdapter.kt` | — | alerts.md#ratelimitdenied |
| `readmates.redis.fallbacks` | counter | `feature` (`notes-cache` / `public-cache` / `auth-session` / `rate-limit` / `read-cache-invalidation`) | 건수 | Redis 오류 발생 시 graceful fallback 처리된 횟수. 증가 지속 시 Redis 불안정 신호. | `server/.../RedisCacheMetrics.kt` (다수 어댑터에서 호출) | dashboards.md#redis-cache | alerts.md#redisfallbackshigh |
| `readmates.redis.operation.errors` | counter | `feature`, `operation` | 건수 | Redis 명령 실행 오류 횟수. `feature`는 어댑터별 식별자, `operation`은 명령 유형(예: `check`). | `server/.../RedisCacheMetrics.kt` (다수 어댑터에서 호출) | dashboards.md#redis-cache | alerts.md#redisoperationerrors |
| `readmates.resilience.state_transition` | counter | `name`, `from`, `to` | 건수 | Outbound circuit breaker 상태 전이 횟수. `name`은 breaker 식별자, `from`/`to`는 CircuitBreaker state. | `server/.../shared/adapter/out/resilience/OutboundCircuitBreakers.kt` | — | — |
| `readmates.resilience.short_circuited` | counter | `name` | 건수 | Circuit breaker가 OPEN 상태라 호출이 차단(fail-open fallback)된 횟수. | `server/.../shared/adapter/out/resilience/OutboundCircuitBreakers.kt` | — | — |
| `bff.audit.shutdown.dropped` | counter | (없음) | 건수 | BFF audit 태스크가 executor 종료 또는 큐 포화로 폐기된 횟수. graceful shutdown 시 0이 정상. 지속 증가 시 audit 손실 신호. | `server/.../security/BffSecretAuditExecutorConfig.kt` | — | — |
| `notification.dispatch.unknown_status` | counter | (없음) | 건수 | SMTP 발송 결과가 `UNKNOWN`이라 retryable로 처리한 이메일 deliveries 건수. 짧은 spike는 정상, 지속 증가 시 SMTP 응답 모호 또는 어댑터 상태 매핑 문제 신호. | `server/.../notification/application/service/NotificationDispatchService.kt` | dashboards.md#notification-pipeline | — |
| `readmates.aigen.jobs` | counter | (없음) | 건수 | AI generation job accepted count. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | — |
| `readmates.aigen.jobs.completed` | counter | `status`, `provider`, `model`, `kind` | 건수 | Terminal status로 끝난 AI generation job 수. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | alerts.md#aigenprovidererrorburst |
| `readmates.aigen.latency` | timer/histogram | `provider`, `model`, `kind` | 초 | AI provider 호출 wall-clock latency. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | — |
| `readmates.aigen.tokens` | counter | `provider`, `model`, `direction` | token | Input, cached input, output token 사용량. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | — |
| `readmates.aigen.cost.usd` | counter | `provider`, `model` | USD | AI generation 누적 비용 추정치. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | alerts.md#aigenbudgetexhaustion |
| `readmates.aigen.validation.failures` | counter | `reason` | 건수 | Validation class error로 실패한 AI output 수. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | alerts.md#aigenschemafailurespike |
| `readmates.aigen.cap.denials` | counter | `reason` | 건수 | Provider 호출 전 cap guard가 거절한 요청 수. | `server/.../aigen/application/service/AiGenerationMetrics.kt` | dashboards.md#ai-session-generation | — |
| `readmates.aigen.queue.depth` | gauge | (없음) | 건수 | Redis AI job store에서 `PENDING` + `RUNNING` active job 수를 scrape 시점에 읽은 backlog. `AiGenerationQueueDepthGaugeBinder`가 `AiGenerationJobStore.loadActiveJobs()`에 바인딩한다. | `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`, `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt` | dashboards.md#ai-session-generation | alerts.md#aigenqueuelaghigh |
| `readmates.frontend.route_load` | timer/histogram | `route_pattern`, `result`, `navigation_type` | 초 | Browser route transition duration. Route values are normalized patterns only. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | slos.md#frontend_route_load_p95 |
| `readmates.frontend.runtime_errors` | counter | `route_pattern`, `error_kind`, `error_code`, `severity` | 건수 | Browser runtime and route-boundary errors grouped without raw messages or stack traces. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | slos.md#frontend_runtime_error_ratio |
| `readmates.frontend.api_failures` | counter | `route_pattern`, `api_group`, `status_class`, `error_code` | 건수 | Frontend-observed API failures after safe API error conversion. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | — |
| `readmates.frontend.observability.dropped` | counter | `reason` | 건수 | Dropped frontend telemetry events due to validation, size, unsupported value, or rate-limit policy. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | — |

> **태그 정책**: enum/low-cardinality 값만 허용. `club_id`, `user_id`, `membership_id`, `email`, `delivery_id`, transcript 본문 등 고유 식별자나 민감 본문은 절대 태그로 사용하지 않는다. 행 단위 감사는 notification은 `notification_deliveries`, AI 생성은 `ai_generation_audit_log`를 사용한다. 근거: `server/.../ReadmatesOperationalMetrics.kt`, `server/.../aigen/application/service/AiGenerationMetrics.kt` KDoc 참조.

## 표준 메트릭 그룹

### HTTP

- `http_server_requests_seconds_count` (counter, by `uri`, `status`, `method`, `outcome`)
- `http_server_requests_seconds_sum` (counter, 같은 라벨)
- `http_server_requests_seconds_max` (gauge, 같은 라벨)
- `http_server_requests_seconds_bucket` (histogram bucket)

라벨 `uri`는 Spring path template (예: `/api/sessions/current`). 정규화된 path를 사용하므로 cardinality 안전.

### JVM

- `jvm_memory_used_bytes` (gauge, by `area` / `id`)
- `jvm_memory_max_bytes` (gauge, by `area` / `id`)
- `jvm_gc_pause_seconds` (histogram, by `action` / `cause`)
- `jvm_threads_live_threads` (gauge)
- `jvm_threads_states_threads` (gauge, by `state`)

### HikariCP (DB connection pool)

- `hikaricp_connections` (gauge — total)
- `hikaricp_connections_active` (gauge)
- `hikaricp_connections_idle` (gauge)
- `hikaricp_connections_pending` (gauge — *0이 정상*. 지속적으로 양수면 pool 부족)
- `hikaricp_connections_acquire_seconds_max` (gauge)
- `hikaricp_connections_usage_seconds_count` / `_sum` / `_max` (histogram)

### Logback

- `logback_events_total` (counter, by `level=ERROR/WARN/INFO/DEBUG/TRACE`)

## DB row 기반 측정 (메트릭 아님, 쿼리)

다음은 Prometheus 메트릭으로 export되지 않지만 dashboard 패널 또는 수동 진단에 활용 가능한 쿼리다. 테이블/컬럼 존재 확인 완료 (migration SQL 기준).

| 측정 | 쿼리 |
|------|------|
| BFF secret 회전 이력 | `SELECT count(*), max(used_at) FROM bff_secret_rotation_audit;` |
| Notification delivery state 분포 | `SELECT status, count(*) FROM notification_deliveries GROUP BY status;` |
| Notification event outbox state 분포 | `SELECT status, count(*) FROM notification_event_outbox GROUP BY status;` |
| AI generation provider/model/status 분포 | `SELECT provider, model, status, count(*) FROM ai_generation_audit_log GROUP BY provider, model, status;` |
| AI generation per-club monthly cost | `SELECT club_id, SUM(cost_estimate_usd) FROM ai_generation_audit_log WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') GROUP BY club_id;` |

> 참고: `bff_secret_rotation_audit`의 날짜 컬럼은 `used_at`(datetime). `notification_deliveries`와 `notification_event_outbox`의 상태 컬럼은 `status`. 확인 근원: `server/src/main/resources/db/mysql/migration/V26__bff_secret_rotation_audit.sql`, `V20__kafka_notification_pipeline.sql`.

## 후속 메트릭 후보 (현재 없음)

- `bff_request_total` (counter, by `route`, `host`) — Cloudflare Worker analytics 의존. BFF layer에서 별도 계측 필요.
- External blackbox/synthetic checks for full script-load failure remain a future candidate. The in-app route-load metric starts only after the SPA executes enough JavaScript to emit telemetry.
- `readmates.redis.operation.errors` 세분화 — 현재 `feature`/`operation` 2개 태그로 충분하나, 향후 Redis Cluster 도입 시 `node` 태그 추가 검토.
- Kafka consumer group lag을 별도 Prometheus metric으로 노출할지 검토 — 현재 `readmates.aigen.queue.depth`는 Redis active job backlog 의미로 고정합니다.
