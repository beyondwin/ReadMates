# ADR-0004: Transactional outbox + Kafka relay (notification)

- 상태: Accepted
- 결정일: 2026-04-29
- 작성자: 서버 아키텍처/인프라
- 관련: ADR-0002 (clean architecture), ADR-0007 (MySQL + Flyway),
  `server/src/main/kotlin/com/readmates/notification/`,
  `server/src/main/resources/db/mysql/migration/V16__notification_outbox.sql`,
  `server/src/main/resources/db/mysql/migration/V20__kafka_notification_pipeline.sql`,
  `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt`,
  `server/src/main/kotlin/com/readmates/notification/application/service/CachedNotificationBacklogProvider.kt`,
  `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`,
  `docs/development/architecture.md`

## 컨텍스트

ReadMates에서 알림은 다음 domain mutation이 발생할 때 생성된다:
- 세션 발행 (`CLOSED → PUBLISHED`)
- 멤버 초대 발송
- 피드백 문서 공개
- 서평 공개
- 초대 수락

각 mutation에서 이메일과 in-app 알림이 발송되어야 한다. "mutation 처리 + 알림 발송"을 어떻게 결합할 것인가를 결정해야 했다.

### 초기 접근의 문제

가장 단순한 방법은 mutation 처리 코드 내에서 직접 SMTP를 호출하는 것이다:

```kotlin
// 단순하지만 문제 있는 패턴
@Transactional
fun publishSession(sessionId: UUID): Session {
    val session = sessionRepo.findById(sessionId)
    session.publish()
    sessionRepo.save(session)
    emailService.send(buildSessionPublishedEmail(session))  // SMTP 직접 호출
    return session
}
```

이 패턴은 세 가지 심각한 문제를 가진다:

**문제 1: Mutation latency가 SMTP 응답 시간에 묶인다.**
SMTP 서버 응답 시간이 가변적이다. 정상 케이스에도 200-500ms가 걸리며, SMTP 서버가 일시적으로 느리면 mutation 응답 시간이 수초로 늘어난다. 회원 입장에서는 "세션 발행"이 왜 느린지 알 수 없다.

**문제 2: SMTP 실패 시 mutation까지 롤백된다.**
같은 트랜잭션에 묶으면 SMTP 실패 시 세션 발행이 취소된다. "세션은 발행됐지만 알림 발송에 실패했다"는 상태를 올바르게 처리하지 못한다. 분리하면 consistency 보장이 어려워진다.

**문제 3: 재시도와 실패 추적이 없다.**
SMTP가 실패하면 누가 언제 재시도할 것인가? 어디에 실패를 기록할 것인가? 운영자가 어떻게 실패한 알림을 확인할 것인가?

### Transactional Outbox 패턴

Transactional Outbox 패턴은 이 문제를 해결한다:
1. mutation과 알림 이벤트 기록이 *같은 DB 트랜잭션*에서 이루어진다.
2. 실제 발송(SMTP, in-app)은 별도 프로세스가 담당한다.

이 방식에서 "mutation이 커밋됐다 ⇔ 알림 이벤트가 outbox에 적재됐다"가 원자적으로 보장된다. SMTP unavailability가 mutation 성공/실패에 영향을 주지 않는다.

### Kafka 도입 이유

Outbox에서 consumer로 이벤트를 전달하는 방법으로 두 가지를 검토했다:

1. **DB polling만 (Kafka 없음)**: consumer가 outbox 테이블을 주기적으로 polling. 단순하지만 consumer scale-out과 이벤트 replay가 없다.
2. **Outbox → Kafka relay → consumer**: relay가 outbox에서 Kafka로 publish, consumer가 Kafka에서 소비. consumer를 독립적으로 scale할 수 있고, 이벤트 replay 가능.

향후 consumer scale-out과 notification 기능 확장 가능성을 고려해 Kafka(Redpanda)를 포함했다.

## 결정

알림 이벤트를 다음 3단계 파이프라인으로 처리한다:

### 1단계: Domain mutation → `notification_event_outbox` (동일 트랜잭션)

mutation 처리 시 같은 `@Transactional` 내에서 `notification_event_outbox` 테이블에 row를 삽입한다. `JdbcNotificationEventOutboxAdapter.kt:52`가 이 삽입을 담당한다. mutation rollback 시 outbox row도 함께 rollback된다.

`notification_event_outbox` 상태 머신:
- `PENDING` — 삽입됨, relay 대기 중
- `PUBLISHING` — relay가 Kafka로 publish 중 (lease timeout: 15분, `JdbcNotificationEventOutboxAdapter.kt:31`)
- `PUBLISHED` — Kafka publish 성공
- `FAILED` — publish 실패, 재시도 예정
- `DEAD` — 최대 재시도 초과, 수동 처리 필요

schema constraint: `V20__kafka_notification_pipeline.sql:25`
```sql
constraint notification_event_outbox_status_check
  check (status in ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD'))
```

`dedupe_key` (unique key, `V20__kafka_notification_pipeline.sql:20`)로 중복 outbox row 삽입을 방지한다.

### 2단계: Relay scheduler → Kafka topic

별도 scheduler가 `PENDING`/`FAILED` 상태의 outbox row를 읽어 Kafka topic `readmates.notification.events.v1`으로 publish한다. publish 성공 시 `PUBLISHED`로 갱신한다.

### 3단계: Kafka consumer → `notification_deliveries` state machine

Kafka consumer가 이벤트를 소비해 수신자와 채널(EMAIL, INBOX)별 `notification_deliveries` row를 만든다.

`notification_deliveries` 상태 머신:
- `PENDING` — 생성됨, 발송 대기
- `SENDING` — 발송 중
- `SENT` — 발송 완료
- `FAILED` — 발송 실패, 재시도 예정
- `DEAD` — 최대 재시도 초과
- `SKIPPED` — 멤버 알림 설정 등으로 발송 건너뜀

schema constraint: `V20__kafka_notification_pipeline.sql:58`

`NotificationDeliveryEngine.kt:24`가 실제 발송(SMTP, in-app)을 수행하며, dispatch path와 pending-delivery worker path가 같은 engine을 사용한다.

`CachedNotificationBacklogProvider.kt:10`가 backlog gauge를 1분 주기로 캐시해 Prometheus에 노출한다.

## 근거

### 트랜잭션 일관성 보장

mutation과 outbox row 삽입이 동일 트랜잭션이므로:
- mutation 성공 ⇔ outbox 적재 완료가 원자적으로 보장된다.
- Kafka가 일시적으로 unavailable해도 outbox에 이벤트가 누적된다. relay 복구 후 자동 재처리된다.
- SMTP unavailability가 mutation 응답 시간에 영향을 주지 않는다.

### 멱등성 보장

`notification_event_outbox`의 `dedupe_key` unique constraint가 같은 이벤트의 중복 삽입을 차단한다. consumer 측도 delivery row를 idempotent하게 생성한다. mutation이 여러 번 retry돼도 알림이 중복 발송되지 않는다.

### Privacy 보호

발송 이력에 raw email을 저장하지 않는다:
- `notification_deliveries`에는 masked recipient (이메일 일부 치환) + hash만 저장된다.
- host audit ledger에는 subject, masked recipient, deep link만 노출된다.
- raw email은 발송 시점에만 SMTP adapter에서 사용되고 DB에 남지 않는다.

### 단일 delivery engine으로 drift 방지

이메일과 in-app 알림 모두 `NotificationDeliveryEngine`을 통해 처리된다. subject/plain/HTML body를 생성하는 template helper가 단일 진입점이므로:
- 이메일 CTA와 in-app deep link가 서로 drift하지 않는다.
- retry/dead 전환 로직이 한 곳에 있다.
- metrics/logging이 dispatch path와 worker path에서 동일하게 적용된다.

### 운영 가시성

`CachedNotificationBacklogProvider`가 outbox backlog를 Prometheus metric으로 노출한다. backlog가 threshold를 넘으면 알람 트리거 가능. 운영 화면에서 발송 상태를 확인하고 DEAD row를 수동으로 재처리할 수 있다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| 동기 SMTP 호출 (mutation 내에서 직접) | mutation latency가 SMTP 응답 시간에 묶인다. SMTP 실패 시 mutation rollback과의 결합 문제. 재시도 로직이 mutation 코드에 섞인다. 운영 중 SMTP 장애가 곧 서비스 기능 장애로 이어진다. |
| Kafka 직접 produce (outbox 없이) | DB commit 후 Kafka produce 실패 시 이벤트 유실. DB commit 전 Kafka produce 후 DB rollback 시 spurious 이벤트 발생. 두 시스템 간 2PC는 구현 복잡도가 높고 성능 저하를 유발한다. |
| DB polling만 (Kafka 없이) | 단순하지만 consumer scale-out이 없다. 이벤트 replay가 없다. polling 주기로 인한 최소 latency가 존재한다. 현재 규모에서 선택 가능한 단순화 방법이었으나, 향후 확장 가능성을 고려해 Kafka를 포함했다. |
| Spring ApplicationEventPublisher (in-process event) | 동일 JVM 내 in-process 이벤트다. 프로세스 재시작 시 미처리 이벤트가 유실된다. transactional guarantee가 없다. 분산 환경에서 동작하지 않는다. |
| AWS SQS / SNS 또는 Cloud Pub/Sub | 외부 클라우드 서비스 의존. 추가 비용 발생. OCI 기반 zero-cost 제약에 위배. vendor lock-in이 추가된다. |

## 결과

긍정적:
- Kafka 일시 장애 시에도 outbox에 이벤트가 누적되어 자동 재처리된다. 알림 유실이 없다.
- mutation 응답 시간이 SMTP latency와 분리된다. 세션 발행 응답이 이메일 발송 완료를 기다리지 않는다.
- 발송 이력이 `notification_deliveries`에 row로 남아 감사, 재시도, 호스트 운영 화면에 활용된다.
- Privacy: raw email이 audit log에 남지 않는다. masked recipient + hash만 사용.
- `CachedNotificationBacklogProvider`가 backlog를 Prometheus metric으로 노출해 운영 모니터링이 가능하다.
- `dedupe_key`로 중복 알림 발송이 방지된다.

부정적/감수한 비용:
- Redpanda(Kafka-compatible) 컨테이너를 OCI Compose stack에서 운영한다. Redpanda가 불안정하면 relay가 중단되고 outbox backlog가 쌓인다. 로컬 개발에서도 Redpanda 컨테이너가 필요하다.
- backlog gauge 모니터링 알림이 없으면 outbox가 조용히 쌓인다. 운영 알림 임계값 설정 필요.
- dead letter(DEAD 상태 row) 자동 알림이 아직 구현되지 않았다. 수동 조회 필요.
- notification pipeline 상태(`PENDING`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `DEAD`) 이해를 위한 onboarding 비용이 있다.
- consumer process와 web process가 현재 같은 jar에서 실행된다. 분리 운영은 후속 작업.

## 검증

전체 notification 테스트:
```bash
./server/gradlew -p server test --tests "com.readmates.notification.*"
```

Testcontainers Kafka 통합 테스트:
```bash
./server/gradlew -p server test --tests "com.readmates.notification.kafka.*"
```
`server/src/test/kotlin/com/readmates/support/KafkaTestContainer.kt` — Testcontainers 기반 Redpanda 컨테이너

schema 검증:
- `V16__notification_outbox.sql` — 초기 outbox 테이블
- `V19__notification_outbox_metadata.sql` — metadata 컬럼 추가
- `V20__kafka_notification_pipeline.sql` — 전체 notification 파이프라인 재설계, status constraint 포함

outbox 상태 확인:
```sql
select status, count(*) from notification_event_outbox group by status;
```
기대: DEAD row가 0이고, PENDING/FAILED row가 적시에 0으로 수렴해야 한다.

## 후속 작업

- dead letter 자동 alert: outbox 또는 delivery row가 DEAD 상태에 진입하면 운영 알림 발송.
- consumer scale-out 정책: notification worker process를 web process에서 분리하고 독립적으로 스케일. ADR-0015 후보.
- `notification_deliveries`에서 DEAD row 자동 정리(TTL) 정책 결정.
- Redpanda → Apache Kafka 마이그레이션 시점 기준(트래픽, 기능 요구사항).
