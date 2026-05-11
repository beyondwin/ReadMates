# Case Study 02 — Mutation과 알림 발송의 결합 분리 (transactional outbox)

> 세션 발행/멤버 초대 등 mutation의 side effect로 이메일과 in-app 알림이 발송됩니다. 동기 발송은 mutation latency를 SMTP에 묶고, 발송 실패가 mutation rollback을 일으킵니다. MySQL transactional outbox + Kafka relay + state machine consumer로 mutation과 발송을 분리했고, masked audit ledger와 backlog gauge로 운영 가시성을 확보했습니다.

## 문제

**동기 발송의 두 가지 결합**

세션 발행, 멤버 초대 등 mutation은 완료 직후 알림을 보내야 합니다. 가장 단순한 구현은 mutation 트랜잭션 안에서(또는 직후에) SMTP 호출을 넣는 것인데, 이 방식은 두 가지 결합을 만듭니다.

1. **latency 결합**: mutation 응답 시간 = 비즈니스 로직 시간 + SMTP 왕복 시간. SMTP 서버가 느리면 모든 mutation이 느려집니다.
2. **가용성 결합**: SMTP 장애 → 발송 실패 → mutation rollback(또는 발송 누락). 어떤 선택을 해도 일관성이 깨집니다.

**비동기 fire-and-forget도 안 됨**

동기 발송의 대안으로 스레드/코루틴에 발송을 위임하면 latency는 분리되지만 더 심각한 문제가 생깁니다.

- mutation은 성공했는데 알림이 전송 전에 프로세스가 재시작되면 알림 유실.
- mutation이 예외로 rollback되어도 이미 fire한 발송 작업은 실행 중.

두 경우 모두 mutation 결과와 알림 발송 사이의 인과 관계가 깨집니다. 트랜잭션 경계 밖에 있는 외부 시스템(SMTP, Kafka)은 DB commit과 원자적으로 묶을 수 없으므로, DB commit과 같은 트랜잭션에 기록을 남기고 commit 이후에 외부 호출을 수행하는 구조가 필요합니다.

**제약**

- MySQL + Spring Boot 환경 — 분산 트랜잭션(XA) 없음.
- OCI free tier — 외부 managed 워커 서비스 추가 비용/의존 불가.
- 1인 운영 — relay/consumer 장애가 조용히 숨으면 안 됩니다.

## 접근

| 대안 | 기각 이유 |
|------|----------|
| 동기 SMTP (mutation path 내) | mutation latency가 SMTP에 묶임. SMTP 장애 → mutation 실패. |
| Kafka 직접 publish (outbox 없이) | Kafka publish 실패 vs DB commit 실패 race. 트랜잭션 경계가 깨짐. |
| 별도 jobs 테이블 polling (Kafka 없이) | polling latency 상한이 poll 주기. consumer scale-out이 어려움. |
| 외부 워커 (Cloud Tasks 등) | OCI free tier 제약. 추가 비용/외부 의존. |

선택: **MySQL transactional outbox + Kafka relay + state machine consumer**.

mutation과 같은 DB 트랜잭션에 `notification_event_outbox` row를 INSERT합니다. relay가 outbox를 polling해서 Kafka로 publish하고, consumer가 Kafka 메시지를 받아 `notification_deliveries`에 채널별 delivery row를 INSERT한 뒤 실제 발송을 실행합니다. 각 단계는 idempotency key(`dedupe_key`)로 중복 실행이 안전하며, 각자 독립적으로 재시도합니다.

## 구현

**흐름 다이어그램**

```text
[Mutation TX]
  ├─ INSERT business row (sessions, memberships, ...)
  └─ INSERT notification_event_outbox row   (같은 트랜잭션 commit)
                |
                v
      [NotificationEventRelayScheduler]     (30초 고정 지연, idempotent)
       └─ NotificationRelayService.publishPending(batchSize)
                |
                v  claimPublishable → publish → markPublished
            [Kafka topic: readmates.notification.events.v1]
            [consumer group: readmates-notification-dispatcher]
                |
                v
      [NotificationEventKafkaListener]
       └─ NotificationDispatchService.dispatch(message)
                |
      ┌─────────┴──────────────────────────┐
      v                                    v
  notification_deliveries (channel=EMAIL)  notification_deliveries (channel=IN_APP)
      |
      v  claimEmailDelivery
  [NotificationDeliveryEngine.sendClaimed]
      |
      ├── success → markDeliverySent  → SENT
      ├── retryable failure → markDeliveryFailed → FAILED (재시도 예약)
      └── max attempts exceeded → markDeliveryDead → DEAD
```

**마이그레이션 이력**

- `V16__notification_outbox.sql` — 초기 단일 outbox 테이블 (`notification_outbox`). email 본문을 row에 직접 저장.
- `V18__notification_preferences_and_test_mail_audit.sql` — 알림 설정 + 테스트 메일 audit 테이블.
- `V19__notification_outbox_metadata.sql` — outbox 메타데이터 컬럼 추가.
- `V20__kafka_notification_pipeline.sql` — `notification_event_outbox` (이벤트 payload JSON) + `notification_deliveries` (채널별 delivery 상태). Kafka 도입으로 outbox와 delivery를 분리.

**outbox 삽입 — `JdbcNotificationEventOutboxAdapter.enqueueEvent`**

```kotlin
// server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt:41
override fun enqueueEvent(
    clubId: UUID,
    eventType: NotificationEventType,
    aggregateType: String,
    aggregateId: UUID,
    payload: NotificationEventPayload,
    dedupeKey: String,
): Boolean =
    try {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id,
              payload_json, kafka_topic, kafka_key, status, dedupe_key
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            ...
        ) > 0
    } catch (_: DuplicateKeyException) {
        false  // dedupe_key unique key — 재호출 시 안전하게 false 반환
    }
```

mutation 서비스는 비즈니스 row INSERT와 같은 `@Transactional` 경계 안에서 `enqueueEvent`를 호출합니다. DB commit이 실패하면 outbox row도 사라지므로, 알림이 발송될 조건과 비즈니스 사실이 항상 일치합니다.

**relay — `NotificationRelayService.publishPending`**

```kotlin
// server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt:25
override fun publishPending(limit: Int): Int {
    val items = notificationEventOutboxPort.claimPublishable(limit)
    items.forEach(::publish)
    return items.size
}
```

`claimPublishable`은 `status = 'PENDING'`인 row에 `locked_at`을 기록해 선점합니다 (lease timeout 15분). 선점 성공 후 Kafka publish에 성공하면 `markPublished`, 실패하면 retry 횟수에 따라 `markPublishFailed` 또는 `markPublishDead`를 호출합니다. `NotificationEventRelayScheduler`가 30초(`fixed-delay-ms: 30000`) 마다 `publishPending(batchSize)` (기본 50)를 실행합니다.

**consumer → delivery engine — `NotificationDeliveryEngine.sendClaimed`**

`NotificationEventKafkaListener`가 `readmates.notification.events.v1` 토픽의 메시지를 받으면 `NotificationDispatchService.dispatch`로 위임합니다. dispatch는 `notification_deliveries`에 EMAIL/IN_APP 채널별 row를 INSERT한 뒤 EMAIL delivery를 즉시 claim해서 `NotificationDeliveryEngine.sendClaimed`를 호출합니다.

```kotlin
// server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt:32
fun sendClaimed(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult {
    val command = MailDeliveryCommand(
        to = requiredDeliveryField(item.id, "recipientEmail", item.recipientEmail),
        subject = requiredDeliveryField(item.id, "subject", item.subject),
        text = requiredDeliveryField(item.id, "bodyText", item.bodyText),
        html = item.bodyHtml?.takeIf { it.isNotBlank() },
    )
    try {
        mailDeliveryPort.send(command)
    } catch (exception: Exception) {
        return markFailure(item, exception)  // FAILED 또는 DEAD
    }
    deliveryPort.markDeliverySent(item.id, item.lockedAt)
    metrics.sent(item.eventType)
    return DeliveryEngineResult.Sent
}
```

`markFailure`는 `item.attemptCount + 1 >= maxAttempts`(기본 5)이면 `markDeliveryDead`, 미만이면 `markDeliveryFailed`로 다음 재시도 시각(5→15→60→240분)을 예약합니다. 결과는 `DeliveryEngineResult` sealed interface(`Sent`, `Dead`, `RetryableFailure`)로 반환되며, `RetryableFailure`만 Kafka consumer retry를 유발합니다.

**state machine**

`notification_event_outbox` (relay 단계):

```kotlin
// server/src/main/kotlin/com/readmates/notification/domain/NotificationEventOutboxStatus.kt
enum class NotificationEventOutboxStatus { PENDING, PUBLISHING, PUBLISHED, FAILED, DEAD }
```

`notification_deliveries` (delivery 단계):

```kotlin
// server/src/main/kotlin/com/readmates/notification/domain/NotificationDeliveryStatus.kt
enum class NotificationDeliveryStatus { PENDING, SENDING, SENT, FAILED, DEAD, SKIPPED }
```

두 state machine은 독립적으로 동작합니다. outbox가 PUBLISHED가 되어야 Kafka consumer가 delivery를 생성할 수 있고, delivery가 SENT가 되어야 최종 발송이 완료됩니다.

**이메일 본문 — `NotificationEmailTemplates.eventCopy`**

plain text와 HTML body를 `NotificationEmailTemplates.eventCopy()` 단일 호출로 생성합니다. 두 형식을 별도 함수로 나누면 내용이 달라질 위험이 있으므로 `NotificationRenderedCopy`를 반환하는 하나의 함수에서 동시에 생성합니다.

**audit 정책**

테스트 메일 발송은 `notification_test_mail_audit` 테이블에 기록됩니다. `recipient_masked_email` 컬럼에는 `maskEmail()` 함수 결과(`k***@example.com` 형식, local part 첫 글자 + `***` + `@domain`)만 저장하고 평문 이메일은 저장하지 않습니다. 추가로 `recipientEmailHash`를 저장해 중복 발송 방지 cooldown 검사에 활용합니다. 운영 delivery 감사는 `notification_deliveries` 테이블을 직접 조회하며, 호스트 대시보드 API는 응답 직렬화 시점에 `maskEmail()`을 적용해 recipient email이 API 응답에 평문으로 노출되지 않습니다.

## 검증

**통합 테스트**

```bash
./server/gradlew -p server test --tests "*Notification*"
```

`NotificationKafkaPipelineIntegrationTest`는 `KafkaTestContainer`를 사용해 실제 Kafka 브로커에서 publish → consume 흐름을 검증합니다. `NotificationRelayServiceTest`, `NotificationDeliveryEngineTest`, `NotificationDispatchServiceTest`는 각 계층의 단위 테스트를 제공합니다.

**backlog 메트릭**

`CachedNotificationBacklogProvider.refresh()`가 60초 고정 지연(`@Scheduled(fixedDelay = 60_000L)`)으로 `notification_deliveries` backlog 집계를 실행하고 결과를 `AtomicReference`에 캐시합니다. `ReadmatesOperationalMetrics`가 초기화 시 `Gauge`를 등록해 스냅샷을 Prometheus에 노출합니다.

```
readmates.notifications.outbox.backlog{status="pending"}
readmates.notifications.outbox.backlog{status="failed"}
readmates.notifications.outbox.backlog{status="dead"}
readmates.notifications.outbox.backlog{status="sending"}
```

backlog가 증가하기 시작하면 relay 또는 consumer 중 하나가 정체되고 있다는 신호입니다.

**발송 결과 카운터**

```
readmates.notifications.sent{event_type=<enum>}
readmates.notifications.failed{event_type=<enum>}
readmates.notifications.dead{event_type=<enum>}
```

태그는 `NotificationEventType` enum 값만 허용합니다. `club_id`, `user_id`, `recipient_email` 등 고카디널리티 값은 태그로 사용하지 않습니다 (별도 시계열 폭발 방지). row 단위 감사 쿼리는 `notification_deliveries` 테이블을 사용합니다.

**e2e**

호스트 대시보드 알림 화면에서 최근 N건의 delivery를 조회해 `sent_at`, 채널, 이벤트 유형, masked recipient를 확인합니다.

## Trade-off와 한계

- **Kafka 운영 부담**: Redpanda(Kafka 호환)를 단일 노드로 운영하더라도 lifecycle 관리, 마이그레이션, 재시작 시 lag 확인이 필요합니다.
- **backlog 모니터링 필수**: backlog gauge가 지속적으로 증가하면 consumer가 죽었거나 relay가 막혔다는 신호이지만 현재 자동 alert는 없습니다. 수동으로 Grafana를 확인해야 합니다.
- **DEAD row 수동 처리**: `notification_event_outbox.status = 'DEAD'` 또는 `notification_deliveries.status = 'DEAD'` row는 자동 alert 없이 쌓입니다. 정기적인 수동 audit이 필요합니다.
- **consumer single instance**: `NotificationEventKafkaListener`는 단일 인스턴스로 실행됩니다. 처리량이 늘면 Kafka partition 수와 consumer 인스턴스를 맞춰 scale-out해야 하지만 현재 구성에서는 single consumer입니다.
- **relay polling 지연**: `NotificationEventRelayScheduler`는 30초 고정 지연으로 실행되므로, commit → relay → Kafka publish 사이에 최대 30초 지연이 발생할 수 있습니다.

## 다시 한다면

- **DEAD row 자동 alert**: `readmates.notifications.outbox.backlog{status="dead"}` gauge에 Prometheus alertmanager rule을 붙여 운영자에게 즉시 알림을 보냅니다. 현재는 Grafana를 열어봐야 알 수 있습니다.
- **email open/bounce webhook 통합**: 현재는 SMTP 서버의 accept 응답까지만 `SENT`로 처리합니다. bounce나 spam 분류는 추적하지 않으므로, 외부 SMTP 서비스의 webhook을 `notification_deliveries`에 반영하는 피드백 루프가 없습니다.
- **consumer partition 병렬화**: idempotency key가 outbox row id로 이미 준비되어 있으므로, Kafka partition 수를 늘리고 consumer group 인스턴스를 여러 개 띄우면 scale-out이 가능합니다. 초기부터 설계에는 포함되어 있었지만 단일 인스턴스로 충분한 동안 미뤘습니다.
- **outbox table partitioning**: `notification_event_outbox`와 `notification_deliveries` 모두 누적 데이터입니다. 1년 이상 운영 후 월 단위 partition pruning을 검토할 시점이 옵니다.

## 관련

- ADR-0004 — transactional outbox + Kafka relay 도입 결정
- ADR-0009 — notification payload schema 검증 (Kafka 메시지 계약)
- 설계 문서: `docs/superpowers/specs/2026-04-29-readmates-kafka-notification-pipeline-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-29-readmates-kafka-notification-pipeline-implementation-plan.md`
