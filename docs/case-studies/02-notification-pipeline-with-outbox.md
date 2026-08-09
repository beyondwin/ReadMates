# Case Study 02 — Mutation과 알림 발송의 결합 분리 (transactional outbox)

> 초대·서평 같은 도메인 이벤트와 호스트가 preview/confirm한 수동 발송을 이메일 및 in-app delivery로 전달합니다. 콘텐츠 저장 자체는 알림을 만들지 않습니다. MySQL transactional outbox + Kafka relay + state machine consumer로 알림 의사결정과 외부 발송을 분리했고, masked audit ledger와 backlog gauge로 운영 가시성을 확보했습니다.

## 문제

**동기 발송의 두 가지 결합**

멤버 초대·서평 공개처럼 알림이 도메인 이벤트의 일부인 흐름과, 다음 책·피드백 문서·세션 기록처럼 호스트가 대상과 채널을 별도로 결정해야 하는 흐름이 있습니다. 어느 경우든 가장 단순한 구현은 콘텐츠 mutation이나 발송 확정 트랜잭션 안에서 SMTP를 직접 호출하는 것인데, 이 방식은 두 가지 결합을 만듭니다.

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

알림 의사결정이 확정되는 DB 트랜잭션에 `notification_event_outbox` row를 INSERT합니다. 자동 도메인 이벤트는 해당 mutation과, 호스트 수동 발송은 consumed preview 및 `notification_manual_dispatches`와 같은 트랜잭션을 사용합니다. Relay가 outbox를 polling해서 Kafka로 publish하고, consumer가 Kafka 메시지를 받아 `notification_deliveries`에 채널별 delivery row를 INSERT한 뒤 실제 발송을 실행합니다. DB/Kafka 단계는 `dedupe_key`와 exact-lease CAS로 논리 중복을 제한하지만, SMTP 외부 side effect는 provider idempotency receipt가 없어 at-least-once입니다.

## 구현

**흐름 다이어그램**

```text
[Notification decision TX]
  ├─ INSERT business row or manual dispatch
  └─ INSERT notification_event_outbox row   (같은 트랜잭션 commit)
                |
                v
      [NotificationEventRelayScheduler]     (inbound adapter, typed 30초 지연)
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
      ├── PERMANENT/expired → markDeliveryDead → DEAD (SMTP 호출 없음 또는 즉시 종료)
      ├── RETRYABLE/AMBIGUOUS → markDeliveryFailed → FAILED (재시도 예약)
      └── max attempts/deadline → markDeliveryDead → DEAD
```

**마이그레이션 이력**

- `V16__notification_outbox.sql` — 초기 단일 outbox 테이블 (`notification_outbox`). email 본문을 row에 직접 저장.
- `V18__notification_preferences_and_test_mail_audit.sql` — 알림 설정 + 테스트 메일 audit 테이블.
- `V19__notification_outbox_metadata.sql` — outbox 메타데이터 컬럼 추가.
- `V20__kafka_notification_pipeline.sql` — `notification_event_outbox` (이벤트 payload JSON) + `notification_deliveries` (채널별 delivery 상태). Kafka 도입으로 outbox와 delivery를 분리.
- `V27__manual_notification_dispatch.sql`, `V28__manual_notification_dispatch_hardening.sql` — 10분 TTL preview와 수동 dispatch 감사 원장, preview 소비 및 dispatch 1:1 제약.
- `V42__host_notification_composer.sql` — current content revision, `SELECTED_MEMBERS`, opt-in 클럽 리마인더 정책을 추가하고 명시적 composer 발송을 강화.

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

자동 이벤트 서비스 또는 수동 발송 확정 서비스는 알림 의사결정 row와 같은 `@Transactional` 경계 안에서 `enqueueEvent`를 호출합니다. DB commit이 실패하면 outbox row도 사라지므로, 알림 발송 의사결정과 outbox 사실이 항상 일치합니다. 다음 책·피드백 문서·세션 기록의 콘텐츠 저장은 composer context만 반환하며 이 호출을 하지 않습니다.

**relay — `NotificationRelayService.publishPending`**

```kotlin
// server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt:25
override fun publishPending(limit: Int): Int {
    val items = notificationEventOutboxPort.claimPublishable(limit)
    items.forEach(::publish)
    return items.size
}
```

`claimPublishable`은 `PENDING`/재시도 가능한 `FAILED` row에 `locked_at`을 기록해 선점합니다(lease 15분). Application service는 주입된 `Clock` 하나로 `createdAt + eventMaxAge`(기본 24시간)를 먼저 검사하고, deadline equality부터 Kafka를 호출하지 않고 `DEAD`로 전환합니다. 선점 성공 후 Kafka publish에 성공하면 `markPublished`, 실패하면 공유 retry schedule과 최대 5회에 따라 `markPublishFailed` 또는 `markPublishDead`를 호출합니다. `@Scheduled`는 application service가 아니라 inbound adapter인 `NotificationEventRelayScheduler`가 소유하고 typed `NotificationRuntimeProperties.Worker`의 30초 fixed delay와 batch 50을 사용합니다.

**consumer → delivery engine — `NotificationDeliveryEngine.sendClaimed`**

`NotificationEventKafkaListener`가 `readmates.notification.events.v1` 토픽의 메시지를 받으면 `NotificationDispatchService.dispatch`로 위임합니다. dispatch는 `notification_deliveries`에 EMAIL/IN_APP 채널별 row를 INSERT한 뒤 EMAIL delivery를 즉시 claim해서 `NotificationDeliveryEngine.sendClaimed`를 호출합니다.

`NotificationDeliveryEngine`도 주입된 `Clock`으로 `createdAt + deliveryMaxAge`(기본 24시간)를 먼저 검사합니다. 만료 equality 또는 필수 mail content 누락은 SMTP를 호출하지 않고 `DEAD`입니다. SMTP adapter는 Spring/Jakarta/transport exception을 application-owned `MailDeliveryFailureKind`로 변환합니다. `PERMANENT`(잘못된 주소/메시지 준비, 인증, 명시적 permanent rejection)는 첫 시도에 `DEAD`; `RETRYABLE`(명시적 transient rejection)과 `AMBIGUOUS`(timeout, connection loss, accepted recipient가 있는 send failure)는 공유 5→15→60→240분 schedule을 따르고 최대 5회 또는 deadline에서 `DEAD`가 됩니다. Raw exception/response/email은 상태·metric label에 저장하지 않습니다. Exact `lockedAt` CAS가 실패하면 stale-lease 오류를 내고 성공/실패 transition을 허위로 기록하지 않습니다.

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

**호스트 수동 발송 작업대**

`/app/host/notifications`는 서버 확인 정책과 backlog 지표를 상태 레일로 먼저 보여주고, `회차 → 알림 종류 → 대상과 채널` 세 결정을 한 작업대에서 받습니다. Preview는 current `contentRevision`, selection hash, 10분 TTL을 고정하고 최종 수신 인원과 채널별 예상 건수를 side sheet에서 보여줍니다. 확정 CTA만 `notification_manual_dispatches`와 outbox row를 만들며 닫기, Escape, backdrop, route navigation은 아무 발송도 만들지 않습니다. 최근 수동 발송 3건은 기본 원장에, 전체 event/delivery와 retry/recovery 도구는 조건부 운영 상세에 둡니다.

## 검증

**통합 테스트**

```bash
./server/gradlew -p server test --tests "*Notification*"
```

`NotificationKafkaPipelineIntegrationTest`는 `KafkaTestContainer`를 사용해 실제 Kafka 브로커에서 publish → consume 흐름을 검증합니다. `NotificationRelayServiceTest`, `NotificationDeliveryEngineTest`, `NotificationDispatchServiceTest`는 각 계층의 단위 테스트를 제공합니다.

**backlog 메트릭**

Inbound adapter인 `NotificationBacklogRefreshScheduler`가 typed initial delay 5초/fixed delay 60초로 refresh input port를 호출합니다. Application-owned `CachedNotificationBacklogProvider`는 event outbox와 delivery를 각각 조회해 마지막 성공 snapshot을 보존합니다. 첫 성공 전 gauge는 `NaN`; 한쪽 실패는 `partial`, 양쪽 실패는 `failure`이고 실패한 쪽을 거짓 0으로 덮지 않습니다.

```
readmates.notifications.outbox.backlog{status="pending"}
readmates.notifications.outbox.backlog{status="failed"}
readmates.notifications.outbox.backlog{status="dead"}
readmates.notifications.outbox.backlog{status="publishing"}
readmates.notifications.delivery.backlog{status="pending"}
readmates.notifications.delivery.backlog{status="failed"}
readmates.notifications.delivery.backlog{status="dead"}
readmates.notifications.delivery.backlog{status="sending"}
readmates.notifications.backlog.refresh{result=~"success|partial|failure"}
```

Event outbox gauge는 relay/Kafka publication, delivery gauge는 email worker/SMTP를 진단합니다. 서로 대체해서 해석하지 않습니다.

**발송 결과 카운터**

```
readmates.notifications.sent{event_type=<enum>}
readmates.notifications.failed{event_type=<enum>}
readmates.notifications.dead{event_type=<enum>}
notification.dispatch.unknown_status
```

알림 성공/실패/dead counter의 태그는 `NotificationEventType` enum 값만 허용합니다. `club_id`, `user_id`, `recipient_email` 등 고카디널리티 값은 태그로 사용하지 않습니다 (별도 시계열 폭발 방지). `notification.dispatch.unknown_status`는 태그 없는 counter입니다. row 단위 감사 쿼리는 `notification_deliveries` 테이블을 사용합니다.

**at-least-once 잔여 위험**

SMTP provider가 메시지를 수락한 뒤 `markDeliverySent` CAS/DB commit 전에 프로세스가 중단되면 15분 lease reclaim 후 같은 mail이 다시 전송될 수 있습니다. DB/Kafka dedupe만으로 외부 side effect를 exactly-once로 만들 수 없으므로 `AMBIGUOUS`를 영구 실패로 축소하지 않습니다. Exactly-once 보장에는 provider idempotency key와 receipt API가 필요하며 현재 범위 밖입니다. 운영자는 provider acceptance 또는 recipient-side evidence 없이 `AMBIGUOUS` delivery를 blind resend하지 않습니다.

**e2e**

호스트 알림 작업대 E2E는 options → preview → confirm, 선택 회원, duplicate resend, side sheet close/Escape/navigation no-send, 최근 dispatch 원장과 mobile bottom sheet를 검증합니다. 운영 상세에서는 최근 delivery의 `sent_at`, 채널, 이벤트 유형, masked recipient를 확인합니다.

## Trade-off와 한계

- **Kafka 운영 부담**: Redpanda(Kafka 호환)를 단일 노드로 운영하더라도 lifecycle 관리, 마이그레이션, 재시작 시 lag 확인이 필요합니다.
- **backlog 모니터링 필수**: event outbox backlog 증가는 relay/Kafka, delivery backlog 증가는 worker/SMTP 신호입니다. 첫 refresh 전 `NaN`과 last-success snapshot을 0으로 해석하지 않습니다. 실제 Alertmanager routing은 운영 환경의 별도 확인 대상입니다.
- **DEAD recovery 분리**: event-outbox `DEAD`에는 이 slice의 범용 replay action이 없으므로 원인 제거와 forward recovery를 분리하고 DB를 직접 수정하지 않습니다. Manual preview/confirm은 새 event를 만드는 forward action입니다. Delivery `DEAD`는 exact 대상과 failure/deadline/lease evidence를 확인한 뒤 host가 한 건씩 `POST /api/host/notifications/items/{id}/restore`로 `PENDING` 복구합니다. Admin replay preview/confirm atomicity는 다음 계획이고, `AMBIGUOUS`는 미수락 evidence 없이 restore/blind resend하지 않습니다.
- **consumer single instance**: `NotificationEventKafkaListener`는 단일 인스턴스로 실행됩니다. 처리량이 늘면 Kafka partition 수와 consumer 인스턴스를 맞춰 scale-out해야 하지만 현재 구성에서는 single consumer입니다.
- **relay polling 지연**: `NotificationEventRelayScheduler`는 30초 고정 지연으로 실행되므로, commit → relay → Kafka publish 사이에 최대 30초 지연이 발생할 수 있습니다.

## 다시 한다면

- **DEAD row alert 실배포**: `readmates.notifications.outbox.backlog{status="dead"}` gauge에 대한 권장 rule은 문서화되어 있습니다. 실제 Alertmanager 배포와 알림 수신 채널 연결을 운영 stack에 추가해야 합니다.
- **email open/bounce webhook 통합**: 현재는 SMTP 서버의 accept 응답까지만 `SENT`로 처리합니다. bounce나 spam 분류는 추적하지 않으므로, 외부 SMTP 서비스의 webhook을 `notification_deliveries`에 반영하는 피드백 루프가 없습니다.
- **consumer partition 병렬화**: idempotency key가 outbox row id로 이미 준비되어 있으므로, Kafka partition 수를 늘리고 consumer group 인스턴스를 여러 개 띄우면 scale-out이 가능합니다. 초기부터 설계에는 포함되어 있었지만 단일 인스턴스로 충분한 동안 미뤘습니다.
- **outbox table partitioning**: `notification_event_outbox`와 `notification_deliveries` 모두 누적 데이터입니다. 1년 이상 운영 후 월 단위 partition pruning을 검토할 시점이 옵니다.

## 관련

- ADR-0004 — transactional outbox + Kafka relay 도입 결정
- ADR-0009 — notification payload schema 검증 (Kafka 메시지 계약)
- 설계 문서: `docs/superpowers/specs/2026-04-29-readmates-kafka-notification-pipeline-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-29-readmates-kafka-notification-pipeline-implementation-plan.md`
