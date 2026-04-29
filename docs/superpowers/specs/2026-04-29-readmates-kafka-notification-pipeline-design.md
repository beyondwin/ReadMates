# ReadMates Kafka 알림 파이프라인 설계

작성일: 2026-04-29
상태: APPROVED DESIGN SPEC
문서 목적: ReadMates 알림 시스템을 Kafka 기반 비동기 멀티채널 파이프라인으로 재설계한다.

## 1. 배경

현재 ReadMates main에는 이미 알림 기능의 1차 구현이 있다. 서버는 `notification_outbox`에 수신자별 이메일 발송 row를 저장하고, scheduler가 pending row를 claim한 뒤 SMTP 또는 logging mail adapter로 발송한다. 멤버는 이메일 알림 preference를 저장할 수 있고, 호스트는 notification operations 화면에서 pending, failed, dead 상태와 test mail을 확인할 수 있다.

이 구조는 작은 운영 환경에서는 실용적이지만, 포트폴리오에서 보여주고 싶은 비동기 처리, 이벤트 기반 설계, 멀티채널 확장성을 표현하기에는 역할이 섞여 있다. 하나의 `notification_outbox` row가 도메인 이벤트, 수신자 계산 결과, 이메일 delivery queue, 운영 ledger를 동시에 담당한다.

새 설계는 알림을 세 단계로 분리한다.

```text
도메인 이벤트 기록
  -> Kafka 발행
  -> 채널별 알림 배송
```

JDBC direct delivery worker는 제거한다. MySQL은 도메인 이벤트와 delivery ledger의 source of truth로 남고, 실제 비동기 처리는 Kafka relay와 Kafka consumer가 담당한다.

## 2. 목표

- 알림 요청을 도메인 이벤트 단위로 기록하는 `notification_event_outbox`를 도입한다.
- DB transaction과 Kafka publish 사이의 불일치를 transactional outbox relay로 복구 가능하게 만든다.
- Kafka consumer가 이벤트를 받아 수신자 계산, preference 적용, 인앱 알림 생성, 이메일 발송을 처리한다.
- 이메일과 인앱 알림의 성공/실패/스킵 상태를 `notification_deliveries`에 채널별로 남긴다.
- 멤버가 읽을 수 있는 `member_notifications` 알림함과 읽음 처리 API를 제공한다.
- 중복 publish, 중복 consume, consumer 재시작에도 중복 메일/중복 인앱 알림이 생기지 않게 한다.
- host notification operations 화면은 이벤트 발행 상태와 채널별 delivery 상태를 함께 보여준다.
- Kafka publish/consume/retry/DLQ/idempotency를 Testcontainers 기반 테스트로 검증한다.

## 3. 비목표

- SMS, Kakao, push notification, digest mode, quiet hours는 포함하지 않는다.
- 알림 consumer를 별도 Spring Boot 서비스로 분리하지 않는다. 1차 구현은 같은 서버 모듈 안에서 Kafka boundary만 분리한다.
- Kafka를 DB의 source of truth로 쓰지 않는다.
- Kafka disabled 상태에서 JDBC direct delivery fallback을 유지하지 않는다.
- 호스트가 알림 본문을 임의 편집하거나 이미 성공한 delivery를 강제로 재발송하는 기능은 만들지 않는다.
- 공개 API나 게스트 surface에 개인 알림 데이터를 노출하지 않는다.

## 4. 핵심 결정

### 4.1 기존 worker 제거

기존 `notification_outbox`를 claim해서 직접 이메일을 보내는 scheduler는 새 구조에서 제거한다. 남는 scheduler는 두 종류다.

| Scheduler/Consumer | 역할 |
| --- | --- |
| Event enqueue scheduler | `SESSION_REMINDER_DUE`처럼 시간 기반 도메인 이벤트를 `notification_event_outbox`에 기록한다. |
| Kafka relay scheduler | `notification_event_outbox`의 `PENDING`/`FAILED` 이벤트를 Kafka에 publish한다. |
| Kafka consumer | Kafka event를 받아 channel delivery를 계획하고 처리한다. |

메일 발송은 Kafka consumer 안의 dispatcher에서만 실행한다.

### 4.2 이벤트와 배송 분리

도메인 이벤트는 "무슨 일이 일어났는가"만 표현한다.

예:

- 다음 책이 멤버에게 공개됨
- 모임 전날 리마인더 시점 도달
- 피드백 문서가 등록됨
- 멤버 서평이 공개됨

수신자 계산, preference 적용, 채널 선택, 발송 성공/실패는 delivery 단계에서 결정한다. 이 분리 덕분에 같은 이벤트에서 이메일, 인앱 알림, 미래의 다른 채널을 파생시킬 수 있다.

### 4.3 Kafka는 경계, MySQL은 ledger

Kafka topic은 비동기 fan-out과 consumer retry를 담당한다. MySQL은 아래 정보를 장기 보관한다.

- 어떤 이벤트를 Kafka에 발행해야 하는지
- 어떤 이벤트가 Kafka에 발행됐는지
- 어떤 멤버에게 어떤 채널로 알림이 계획됐는지
- 어떤 delivery가 성공, 실패, 스킵, dead 처리됐는지
- 멤버가 어떤 인앱 알림을 읽었는지

## 5. 데이터 모델

### 5.1 `notification_event_outbox`

도메인 이벤트 단위 outbox다.

| Column | 설명 |
| --- | --- |
| `id` | 이벤트 id. Kafka message id와 delivery dedupe의 기준이다. |
| `club_id` | 이벤트가 속한 club. |
| `event_type` | `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`, `REVIEW_PUBLISHED`. |
| `aggregate_type` | `SESSION`, `REVIEW`, `SCHEDULE` 같은 이벤트 대상 타입. |
| `aggregate_id` | 대상 id. 시간 기반 이벤트는 deterministic id 또는 별도 schedule id를 쓴다. |
| `payload_json` | 이벤트 처리에 필요한 public-safe metadata JSON. |
| `status` | `PENDING`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `DEAD`. |
| `kafka_topic` | 발행 대상 topic. 기본값은 `readmates.notification.events.v1`. |
| `kafka_key` | partition key. 기본값은 `club_id`. |
| `attempt_count` | Kafka publish 시도 횟수. |
| `next_attempt_at` | relay 재시도 가능 시각. |
| `locked_at` | relay claim 시각. |
| `published_at` | Kafka publish 성공 시각. |
| `last_error` | sanitize된 publish 실패 사유. |
| `dedupe_key` | 이벤트 중복 생성 방지 key. |
| `created_at`, `updated_at` | 감사와 운영 화면용 timestamp. |

`dedupe_key`는 이벤트 타입별로 결정한다.

| Event | Dedupe key |
| --- | --- |
| `NEXT_BOOK_PUBLISHED` | `next-book:{sessionId}` |
| `SESSION_REMINDER_DUE` | `session-reminder:{targetDate}:{sessionId}` |
| `FEEDBACK_DOCUMENT_PUBLISHED` | `feedback-document:{sessionId}:{documentVersion}` |
| `REVIEW_PUBLISHED` | `review-published:{sessionId}:{authorMembershipId}` |

`payload_json`에는 raw email, raw token, BFF secret, OAuth code, private feedback body를 넣지 않는다. 허용 metadata는 session id, session number, book title, document version, author membership id처럼 서버 내부 권한 계산에 필요한 최소값이다.

### 5.2 `notification_deliveries`

수신자와 채널별 delivery ledger다.

| Column | 설명 |
| --- | --- |
| `id` | delivery id. |
| `event_id` | `notification_event_outbox.id`. |
| `club_id` | host scope와 query 최적화용 club id. |
| `recipient_membership_id` | 수신 멤버. |
| `channel` | `EMAIL` 또는 `IN_APP`. |
| `status` | `PENDING`, `SENDING`, `SENT`, `FAILED`, `DEAD`, `SKIPPED`. |
| `dedupe_key` | 채널별 중복 방지 key. |
| `attempt_count` | delivery 처리 시도 횟수. |
| `next_attempt_at` | 이메일 retry 가능 시각. |
| `locked_at` | delivery claim 시각. |
| `sent_at` | 성공 시각. |
| `skip_reason` | preference off, 권한 없음, 이메일 없음 같은 스킵 사유. |
| `last_error` | sanitize된 delivery 실패 사유. |
| `created_at`, `updated_at` | 운영 ledger timestamp. |

`dedupe_key` 예:

```text
{eventId}:{recipientMembershipId}:EMAIL
{eventId}:{recipientMembershipId}:IN_APP
```

`recipient_membership_id, club_id`는 `memberships(id, club_id)`를 참조한다. `dedupe_key`는 unique다.

### 5.3 `member_notifications`

인앱 알림 본문과 읽음 상태다.

| Column | 설명 |
| --- | --- |
| `id` | 인앱 알림 id. |
| `event_id` | 원본 이벤트 id. |
| `delivery_id` | `IN_APP` delivery id. |
| `club_id` | scope와 query 최적화용 club id. |
| `recipient_membership_id` | 수신 멤버. |
| `event_type` | 화면 label과 filter용 event type. |
| `title` | 짧은 제목. |
| `body` | 짧은 본문. |
| `deep_link_path` | 앱 내부 이동 경로. 반드시 `/`로 시작한다. |
| `read_at` | 읽음 시각. |
| `created_at` | 생성 시각. |

인앱 알림도 idempotent해야 하므로 `delivery_id` 또는 `{event_id, recipient_membership_id}`에 unique constraint를 둔다.

### 5.4 기존 preference 유지

멤버 이메일 preference는 유지한다. 인앱 알림은 v1에서 항상 생성하되, 보안/권한 eligibility는 적용한다. 이메일은 기존 global flag와 event-specific flag를 모두 통과해야 `EMAIL` delivery가 `PENDING`이 된다. preference off인 경우 `EMAIL` delivery는 만들지 않거나 `SKIPPED`로 남긴다. 운영 가시성을 위해 v1은 `SKIPPED` delivery를 남기는 쪽을 기본으로 한다.

## 6. Kafka 설계

### 6.1 Topic

| Topic | 역할 |
| --- | --- |
| `readmates.notification.events.v1` | 도메인 알림 이벤트. |
| `readmates.notification.events.dlq.v1` | consumer가 처리하지 못한 이벤트의 dead letter topic. |

consumer group:

```text
readmates-notification-dispatcher
```

Kafka key는 기본적으로 `club_id`를 사용한다. 같은 club의 알림 순서를 크게 흐트러뜨리지 않기 위한 선택이다. 이벤트 idempotency는 key 순서에 의존하지 않고 DB unique constraint와 delivery dedupe로 보장한다.

### 6.2 Message Schema

Kafka value는 versioned JSON이다.

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "clubId": "uuid",
  "eventType": "FEEDBACK_DOCUMENT_PUBLISHED",
  "aggregateType": "SESSION",
  "aggregateId": "uuid",
  "occurredAt": "2026-04-29T00:00:00Z",
  "payload": {
    "sessionId": "uuid",
    "sessionNumber": 12,
    "bookTitle": "Example Book",
    "documentVersion": 1
  }
}
```

Header:

- `readmates-schema-version: 1`
- `readmates-event-id: {eventId}`
- `readmates-event-type: {eventType}`

consumer는 unknown `schemaVersion`을 처리하지 않고 DLQ로 보낸다.

## 7. 서버 구조

`notification` slice 안에서 clean architecture 경계를 유지한다.

```text
notification
  adapter.in.scheduler
  adapter.in.kafka
  adapter.in.web
  adapter.out.kafka
  adapter.out.mail
  adapter.out.persistence
  application.model
  application.port.in
  application.port.out
  application.service
  domain
```

권장 port:

| Port | 역할 |
| --- | --- |
| `RecordNotificationEventUseCase` | 도메인 서비스가 이벤트를 기록한다. |
| `PublishNotificationEventsUseCase` | relay scheduler가 pending event를 Kafka에 발행한다. |
| `DispatchNotificationEventUseCase` | Kafka consumer가 이벤트를 delivery로 전개한다. |
| `NotificationEventOutboxPort` | event outbox 저장, claim, publish 상태 갱신. |
| `NotificationEventPublisherPort` | Kafka publish 추상화. |
| `NotificationDeliveryPort` | delivery 생성, claim, 성공/실패/스킵 기록. |
| `MemberNotificationPort` | 인앱 알림 생성, 조회, 읽음 처리. |
| `MailDeliveryPort` | 이메일 발송. 기존 port를 유지하거나 delivery command 중심으로 확장한다. |

web adapter는 SQL, Kafka client, mail sender를 직접 주입받지 않는다. Kafka listener도 inbound adapter로 보고 application service를 호출한다.

## 8. 처리 흐름

### 8.1 이벤트 기록

도메인 mutation은 성공 transaction 안에서 이벤트를 기록한다.

```text
피드백 문서 업로드 transaction
  -> 문서 저장
  -> notification_event_outbox insert
commit
```

중복 이벤트는 `dedupe_key` unique constraint로 막는다. 중복 insert는 성공으로 취급하되 새 Kafka publish를 만들지 않는다.

### 8.2 Kafka Relay

relay는 `PENDING` 또는 `FAILED` 중 `next_attempt_at <= now`인 이벤트를 claim한다.

```text
PENDING/FAILED
  -> PUBLISHING
  -> Kafka publish 성공: PUBLISHED
  -> Kafka publish 실패: FAILED 또는 DEAD
```

Kafka publish 성공은 producer ack 이후에만 기록한다. relay가 publish에 성공했지만 DB update 전에 죽으면 같은 이벤트가 재발행될 수 있다. consumer는 event id와 delivery dedupe로 이를 안전하게 처리한다.

### 8.3 Consumer Dispatch

consumer는 Kafka event를 받으면 아래 순서로 처리한다.

1. event id로 event outbox row가 있는지 확인한다.
2. event가 현재 서버가 지원하는 schema인지 확인한다.
3. 이벤트 타입별 recipient query를 실행한다.
4. 각 recipient에 대해 `IN_APP`, `EMAIL` delivery를 생성하거나 `SKIPPED`로 기록한다.
5. `IN_APP` delivery는 `member_notifications` row 생성 뒤 `SENT`로 표시한다.
6. `EMAIL` delivery는 preference가 켜진 경우에만 발송하고 성공/실패를 기록한다.

consumer는 DB transaction과 Kafka ack 순서를 명확히 한다. delivery ledger 반영이 끝난 뒤 ack한다. 중간 실패가 있으면 Kafka retry 또는 DLQ로 넘어가며, 이미 생성된 delivery row는 dedupe key 때문에 재시도 시 중복 생성되지 않는다.

### 8.4 Email Retry

이메일 발송 실패는 Kafka consumer의 event 재처리 경로에서 처리한다.

- consumer 처리 중 일시 실패: 해당 `EMAIL` delivery를 `FAILED`로 기록하고 `next_attempt_at`을 설정한 뒤 event 처리를 실패로 끝낸다.
- Kafka retry listener가 같은 event를 다시 처리한다.
- 재처리 시 이미 `SENT`인 delivery와 `SENT`인 in-app delivery는 건너뛰고, `FAILED`이면서 `next_attempt_at <= now`인 `EMAIL` delivery만 다시 claim한다.

이메일 retry는 Kafka event를 재처리하되, 실제 발송 대상은 실패한 `EMAIL` delivery로 좁힌다. 이렇게 해야 이미 성공한 인앱 알림과 다른 이메일 delivery를 반복 처리하지 않는다. 별도 scheduler가 DB에서 `FAILED` email delivery를 직접 claim해 메일을 보내는 경로는 만들지 않는다.

## 9. 이벤트별 수신자 규칙

| Event | 인앱 알림 | 이메일 |
| --- | --- | --- |
| `NEXT_BOOK_PUBLISHED` | 같은 club의 active/viewer/member/host 중 예정 세션을 볼 수 있는 멤버에게 생성 | active 멤버 중 preference on |
| `SESSION_REMINDER_DUE` | 대상 세션을 볼 수 있는 멤버에게 생성 | active 멤버 중 preference on |
| `FEEDBACK_DOCUMENT_PUBLISHED` | 참석 확정 멤버와 host에게 생성 | 참석 확정 active 멤버 중 preference on |
| `REVIEW_PUBLISHED` | 같은 club의 member-visible 기록을 볼 수 있는 멤버에게 생성, 작성자는 제외 | active 멤버 중 preference on, 작성자 제외 |

viewer에게 이메일을 보낼지 여부는 기존 preference/eligibility 정책을 따른다. 권한이 애매한 경우 이메일은 보내지 않고 인앱 알림도 생성하지 않는 쪽을 기본으로 한다.

## 10. API와 UI

### 10.1 멤버 알림함

새 API:

- `GET /api/me/notifications`: 내 인앱 알림 목록. unread first 또는 최신순.
- `GET /api/me/notifications/unread-count`: 상단 badge용 unread count.
- `POST /api/me/notifications/{id}/read`: 단건 읽음 처리.
- `POST /api/me/notifications/read-all`: 현재 멤버의 읽지 않은 알림 전체 읽음 처리.

모든 API는 현재 membership scope만 조회한다. 다른 멤버의 notification id는 not-found처럼 처리한다.

프론트엔드:

- 모바일/데스크톱 app chrome에 unread badge를 표시한다.
- `/app/me` 또는 별도 `/app/notifications`에서 알림 목록을 보여준다.
- 알림 row는 title, body, 생성 시각, unread 상태, deep link를 가진다.

### 10.2 Host Notification Operations

기존 host page는 새 ledger를 기준으로 재구성한다.

상단 summary:

- Kafka publish pending/failed/dead event count
- delivery failed/dead count
- sent email last 24h
- unread in-app notifications generated last 24h

탭:

- Events: event outbox publish 상태
- Deliveries: 수신자/채널별 delivery 상태
- Test Mail: 기존 test mail audit

상세:

- event detail은 payload allowlist만 보여준다.
- delivery detail은 masked email, channel, status, attempt count, sanitized last error를 보여준다.
- raw email, raw message body, private feedback body는 host API response에 넣지 않는다.

## 11. 설정

Kafka는 알림 delivery의 필수 런타임 의존성이다.

```yaml
readmates:
  notifications:
    enabled: ${READMATES_NOTIFICATIONS_ENABLED:false}
    kafka:
      enabled: ${READMATES_KAFKA_ENABLED:false}
      bootstrap-servers: ${READMATES_KAFKA_BOOTSTRAP_SERVERS:}
      events-topic: ${READMATES_KAFKA_NOTIFICATION_EVENTS_TOPIC:readmates.notification.events.v1}
      dlq-topic: ${READMATES_KAFKA_NOTIFICATION_DLQ_TOPIC:readmates.notification.events.dlq.v1}
      consumer-group: ${READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP:readmates-notification-dispatcher}
      relay-batch-size: ${READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE:50}
      max-publish-attempts: ${READMATES_KAFKA_NOTIFICATION_MAX_PUBLISH_ATTEMPTS:5}
      max-delivery-attempts: ${READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS:5}
```

`READMATES_NOTIFICATIONS_ENABLED=false`이면 이벤트 기록은 할 수 있지만 relay/consumer는 동작하지 않는다. `READMATES_KAFKA_ENABLED=false`이면 Kafka bean, relay, listener가 기동하지 않고 pending event가 쌓인다. host operations 화면은 Kafka disabled 상태와 pending backlog를 보여준다.

## 12. 장애 처리

| 장애 | 처리 |
| --- | --- |
| Kafka publish 실패 | event outbox `FAILED`, backoff 후 relay 재시도, 최대 횟수 초과 시 `DEAD`. |
| relay publish 성공 후 DB update 전 crash | 같은 event가 재발행될 수 있음. consumer idempotency로 중복 delivery 방지. |
| consumer processing 실패 | Kafka retry 후 DLQ. 이미 생성된 delivery는 dedupe로 중복 방지. |
| email 발송 실패 | 해당 `EMAIL` delivery만 `FAILED`, backoff 후 재시도, 최대 횟수 초과 시 `DEAD`. |
| in-app 알림 생성 실패 | 해당 `IN_APP` delivery 실패. event 전체 retry 시 dedupe로 복구. |
| preference 변경과 이벤트 처리 경쟁 | consumer 처리 시점의 preference를 적용한다. 이미 생성된 delivery는 운영 ledger로 남긴다. |

retry delay는 기존 알림 정책처럼 `5m, 15m, 60m, 240m`를 기본값으로 둔다.

## 13. 관측성

Micrometer metric:

- `readmates.notification.events.pending`
- `readmates.notification.events.published`
- `readmates.notification.events.publish.failed`
- `readmates.notification.events.dead`
- `readmates.notification.deliveries.sent`
- `readmates.notification.deliveries.failed`
- `readmates.notification.deliveries.dead`
- `readmates.notification.kafka.consumer.process.duration`
- `readmates.notification.kafka.consumer.dlq`

Metric label에는 event type, channel, status처럼 낮은 cardinality 값만 넣는다. 이메일, 표시 이름, token, deep link path, book title은 label로 쓰지 않는다.

로그는 event id, delivery id, event type, channel 중심으로 남긴다. recipient email과 private body는 로그에 쓰지 않는다.

## 14. 테스트

서버 테스트:

- Flyway migration test: 새 테이블, constraint, index 검증.
- event outbox insert idempotency test.
- Kafka relay test: publish 성공 시 `PUBLISHED`, 실패 시 `FAILED/DEAD`.
- Kafka consumer integration test: event consume 후 delivery와 member notification 생성.
- duplicate consume test: 같은 event가 두 번 와도 delivery와 in-app 알림이 중복되지 않는다.
- email failure retry test: email delivery만 `FAILED`가 되고 재시도 시 성공 처리된다.
- preference test: email off는 `SKIPPED`, in-app은 생성된다.
- access test: 멤버 알림함은 본인 알림만 조회/읽음 처리한다.
- host operations test: cross-club event/delivery detail을 볼 수 없다.

프론트엔드 테스트:

- notification API contract fixture.
- unread count badge와 read action unit test.
- host operations page가 event/delivery 상태를 표시하는 unit test.
- 주요 auth/user-flow 변경이 있으므로 필요한 경우 Playwright smoke를 실행한다.

검증 명령:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

## 15. 구현 순서

1. 서버 dependency와 local `compose.yml`에 Kafka-compatible broker를 추가한다. 로컬 개발은 Redpanda 또는 Kafka 중 하나로 고정한다.
2. Flyway migration으로 `notification_event_outbox`, `notification_deliveries`, `member_notifications`를 추가한다.
3. 기존 `notification_outbox` 중심 application model을 event outbox와 delivery ledger model로 교체한다.
4. Kafka publisher port와 relay scheduler를 구현한다.
5. Kafka listener와 dispatcher service를 구현한다.
6. 이메일 delivery retry와 DLQ 처리를 구현한다.
7. 멤버 알림함 API와 UI를 추가한다.
8. host notification operations 화면을 event/delivery ledger 기준으로 갱신한다.
9. 기존 JDBC direct delivery worker와 관련 status assumption을 제거한다.
10. 서버, 프론트, E2E, public release safety 검증을 실행한다.

## 16. 마이그레이션 방침

현재 프로젝트는 공개 포트폴리오 성격이고 레거시 호환 요구가 낮다. 따라서 기존 `notification_outbox` row를 새 ledger로 완전 마이그레이션하지 않는다.

권장 방침:

- 새 migration으로 새 테이블을 추가한다.
- application code는 새 테이블만 사용한다.
- 기존 `notification_outbox`는 migration에서 즉시 drop하지 않고 한 릴리즈 동안 unused legacy table로 남길 수 있다.
- 공개 문서와 architecture 문서는 새 구조를 source of truth로 갱신한다.
- 운영 데이터 마이그레이션이 필요한 실제 배포 환경에서는 별도 one-off migration을 작성한다.

레거시 테이블을 남기는 경우에도 JDBC direct delivery worker는 코드에서 제거한다. 알림 발송의 유일한 runtime path는 Kafka relay와 Kafka consumer다.

## 17. 설계 검토 결과

- Placeholder 없음. Kafka broker 주소, secret, 실제 이메일, private domain은 문서에 넣지 않았다.
- 이벤트 outbox와 delivery ledger 책임을 분리해 `notification_outbox` 단일 테이블의 역할 혼합을 해소한다.
- Kafka 장애, duplicate publish, duplicate consume, email failure, preference race를 각각 정의했다.
- 구현 범위는 알림 도메인에 한정하고 SMS/push/digest는 제외했다.
- 기존 route/auth/BFF 권한 경계와 host/member scope를 유지한다.
