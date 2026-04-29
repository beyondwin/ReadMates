# ReadMates Kafka Notification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing direct JDBC email delivery worker with a Kafka-backed notification pipeline that records domain events, publishes them through an outbox relay, dispatches email and in-app notifications asynchronously, and exposes member and host notification surfaces.

**Architecture:** Keep MySQL as the source of truth for event and delivery ledgers, and use Kafka as the asynchronous boundary between domain events and channel dispatch. Split the current `notification_outbox` responsibilities into `notification_event_outbox`, `notification_deliveries`, and `member_notifications`, then route all runtime delivery through Kafka relay and Kafka consumer code inside the existing Spring Boot module.

**Tech Stack:** Kotlin, Spring Boot 4, Spring Kafka, MySQL/Flyway, Testcontainers Kafka, React 19, React Router 7, TypeScript, Vitest, Playwright.

---

## Scope Check

This is one feature with server and frontend surfaces. It should ship as one coherent pipeline because the new server ledger, member notification API, and host operations UI depend on the same event/delivery model.

The implementation should not preserve the old JDBC direct delivery worker. It may leave the legacy `notification_outbox` table unused for one release, but application code should stop reading or writing it.

## File Structure

### Server Files

- Modify: `server/build.gradle.kts` - add Spring Kafka and Testcontainers Kafka dependencies.
- Modify: `compose.yml` - add a local Kafka-compatible broker. Prefer Redpanda for simple local setup.
- Modify: `server/src/main/resources/application.yml` - add notification Kafka configuration with disabled defaults.
- Create: `server/src/main/resources/db/mysql/migration/V18__kafka_notification_pipeline.sql` - add event outbox, delivery ledger, and member notification tables.
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventOutboxStatus.kt` - event publish states.
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationDeliveryStatus.kt` - channel delivery states.
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationChannel.kt` - `EMAIL` and `IN_APP`.
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt` - replace outbox item models with event, delivery, and member notification models.
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt` - expose event recording, Kafka relay, Kafka dispatch, host operations, member notification APIs, and preferences.
- Replace: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt` with focused ports:
  - `NotificationEventOutboxPort.kt`
  - `NotificationEventPublisherPort.kt`
  - `NotificationDeliveryPort.kt`
  - `MemberNotificationPort.kt`
  - keep `MailDeliveryPort.kt`.
- Replace: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt` with:
  - `NotificationEventService.kt`
  - `NotificationRelayService.kt`
  - `NotificationDispatchService.kt`
  - `MemberNotificationService.kt`
  - `HostNotificationOperationsService.kt`
  - keep test mail behavior in a small host operations service or helper.
- Replace: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt` with:
  - `JdbcNotificationEventOutboxAdapter.kt`
  - `JdbcNotificationDeliveryAdapter.kt`
  - `JdbcMemberNotificationAdapter.kt`
  - `JdbcNotificationRecipientQueryAdapter.kt` if recipient queries become large.
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt` - Kafka producer adapter.
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt` - Kafka consumer adapter.
- Replace: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxScheduler.kt` with `NotificationEventRelayScheduler.kt` and `NotificationReminderScheduler.kt`.
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt` - expose event and delivery ledger views.
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt` - add in-app notification list, unread count, read actions.
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt` - add event, delivery, and member notification responses.
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt` - add Kafka event and channel delivery metrics.
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` - allow inbound Kafka adapter and block Kafka client usage outside adapters.

### Server Tests

- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` or add assertions in existing migration coverage.
- Create: `server/src/test/kotlin/com/readmates/support/KafkaTestContainer.kt`.
- Replace: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt` with event/delivery/member adapter tests.
- Replace: `server/src/test/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxSchedulerTest.kt` with relay/reminder scheduler tests.
- Replace or update: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationOutboxServiceTest.kt`.
- Modify: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`.
- Modify: `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationPreferenceControllerTest.kt` only if preference response changes.
- Create: `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationControllerTest.kt`.
- Create: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`.

### Frontend Files

- Modify: `front/features/host/api/host-contracts.ts` - add host event/delivery DTOs.
- Modify: `front/features/host/api/host-api.ts` - add host notification event and delivery endpoints.
- Modify: `front/features/host/route/host-notifications-data.ts` - load new event/delivery/test mail data.
- Modify: `front/features/host/route/host-notifications-route.tsx` - wire actions and route state.
- Modify: `front/features/host/ui/host-notifications-page.tsx` - replace old outbox ledger with event/delivery tabs.
- Create: `front/features/notifications/api/notifications-api.ts` - member notification calls.
- Create: `front/features/notifications/api/notifications-contracts.ts` - member notification DTOs.
- Create: `front/features/notifications/route/member-notifications-route.tsx` - optional route if using `/app/notifications`.
- Create: `front/features/notifications/ui/member-notifications-page.tsx` - notification list and read actions.
- Modify: `front/src/app/router.tsx` - add `/app/notifications` route if separate page is selected.
- Modify: `front/shared/ui/mobile-header.tsx`, `front/shared/ui/mobile-tab-bar.tsx`, or the current app chrome components that render notification entry points - add unread badge.
- Modify: `front/features/archive/route/my-page-route.tsx` and `front/features/archive/ui/my-page.tsx` if notifications remain on `/app/me`.
- Modify: `front/tests/unit/api-contract-fixtures.ts` and `front/tests/unit/api-contract-fixtures.test.ts`.
- Modify: `front/tests/unit/host-notifications.test.tsx`.
- Modify: `front/tests/unit/my-page.test.tsx` or create `front/tests/unit/member-notifications.test.tsx`.

### Documentation Files

- Modify: `README.md` - update highlight from JDBC outbox email to Kafka-backed multi-channel notification pipeline.
- Modify: `docs/development/architecture.md` - update notification architecture.
- Modify: `docs/development/local-setup.md` - document local Kafka broker.
- Modify: `docs/development/test-guide.md` - document Kafka/Testcontainers tests.
- Modify: `docs/deploy/oci-backend.md` - document runtime Kafka env vars and operational checks.
- Modify: `docs/deploy/security-public-repo.md` only if new scanner expectations or public safety examples change.

## Task 1: Add Kafka Dependencies and Local Broker Config

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `compose.yml`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/test/kotlin/com/readmates/support/KafkaTestContainer.kt`

- [x] **Step 1: Write a failing Kafka container smoke test**

Create `server/src/test/kotlin/com/readmates/support/KafkaTestContainer.kt`:

```kotlin
package com.readmates.support

import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.utility.DockerImageName

object KafkaTestContainer {
    val container: KafkaContainer by lazy {
        KafkaContainer(DockerImageName.parse("apache/kafka-native:3.9.0"))
            .also { it.start() }
    }
}
```

Create `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaDependencyTest.kt`:

```kotlin
package com.readmates.notification.kafka

import com.readmates.support.KafkaTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class NotificationKafkaDependencyTest {
    @Test
    fun `kafka test container exposes bootstrap servers`() {
        assertThat(KafkaTestContainer.container.bootstrapServers).contains(":")
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.kafka.NotificationKafkaDependencyTest'
```

Expected: FAIL because `org.testcontainers.kafka.KafkaContainer` is not on the test classpath.

- [x] **Step 3: Add dependencies and config**

Modify `server/build.gradle.kts` dependencies:

```kotlin
implementation("org.springframework.kafka:spring-kafka")
testImplementation("org.springframework.kafka:spring-kafka-test")
testImplementation("org.testcontainers:kafka:2.0.2")
```

Modify `compose.yml` by adding a Redpanda service:

```yaml
  kafka:
    image: docker.redpanda.com/redpandadata/redpanda:v24.3.7
    command:
      - redpanda
      - start
      - --overprovisioned
      - --smp=1
      - --memory=512M
      - --reserve-memory=0M
      - --node-id=0
      - --check=false
      - --kafka-addr=PLAINTEXT://0.0.0.0:9092
      - --advertise-kafka-addr=PLAINTEXT://localhost:9092
    ports:
      - "9092:9092"
```

Modify `server/src/main/resources/application.yml` under `readmates.notifications`:

```yaml
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

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.kafka.NotificationKafkaDependencyTest'
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/build.gradle.kts compose.yml server/src/main/resources/application.yml server/src/test/kotlin/com/readmates/support/KafkaTestContainer.kt server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaDependencyTest.kt
git commit -m "chore: add kafka notification infrastructure"
```

## Task 2: Add Event Outbox, Delivery, and Member Notification Schema

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V18__kafka_notification_pipeline.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt` if seed assumptions need notification table names.

- [x] **Step 1: Write failing migration assertions**

In `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`, add assertions after the existing Flyway migration succeeds:

```kotlin
private fun assertKafkaNotificationTablesExist(jdbcTemplate: JdbcTemplate) {
    val tables = jdbcTemplate.queryForList(
        """
        select table_name
        from information_schema.tables
        where table_schema = database()
          and table_name in (
            'notification_event_outbox',
            'notification_deliveries',
            'member_notifications'
          )
        """.trimIndent(),
        String::class.java,
    ).toSet()

    assertThat(tables).containsExactlyInAnyOrder(
        "notification_event_outbox",
        "notification_deliveries",
        "member_notifications",
    )
}
```

Call `assertKafkaNotificationTablesExist(jdbcTemplate)` in the migration test method after `flyway.migrate()`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.support.MySqlFlywayMigrationTest'
```

Expected: FAIL because the new tables do not exist.

- [x] **Step 3: Add migration**

Create `server/src/main/resources/db/mysql/migration/V18__kafka_notification_pipeline.sql`:

```sql
create table notification_event_outbox (
  id char(36) not null,
  club_id char(36) not null,
  event_type varchar(60) not null,
  aggregate_type varchar(60) not null,
  aggregate_id char(36) not null,
  payload_json json not null,
  status varchar(20) not null default 'PENDING',
  kafka_topic varchar(180) not null default 'readmates.notification.events.v1',
  kafka_key varchar(180) not null,
  attempt_count int not null default 0,
  next_attempt_at datetime(6) not null default (utc_timestamp(6)),
  locked_at datetime(6),
  published_at datetime(6),
  last_error varchar(500),
  dedupe_key varchar(220) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key notification_event_outbox_dedupe_key_uk (dedupe_key),
  key notification_event_outbox_status_next_idx (status, next_attempt_at, created_at),
  key notification_event_outbox_club_status_idx (club_id, status, updated_at, created_at),
  constraint notification_event_outbox_club_fk foreign key (club_id) references clubs(id),
  constraint notification_event_outbox_status_check check (status in ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD')),
  constraint notification_event_outbox_attempt_count_check check (attempt_count >= 0),
  constraint notification_event_outbox_dedupe_key_check check (length(trim(dedupe_key)) > 0),
  constraint notification_event_outbox_kafka_topic_check check (length(trim(kafka_topic)) > 0),
  constraint notification_event_outbox_kafka_key_check check (length(trim(kafka_key)) > 0)
);

create table notification_deliveries (
  id char(36) not null,
  event_id char(36) not null,
  club_id char(36) not null,
  recipient_membership_id char(36) not null,
  channel varchar(20) not null,
  status varchar(20) not null default 'PENDING',
  dedupe_key varchar(260) not null,
  attempt_count int not null default 0,
  next_attempt_at datetime(6) not null default (utc_timestamp(6)),
  locked_at datetime(6),
  sent_at datetime(6),
  skip_reason varchar(120),
  last_error varchar(500),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key notification_deliveries_dedupe_key_uk (dedupe_key),
  key notification_deliveries_event_idx (event_id, channel, status),
  key notification_deliveries_club_status_idx (club_id, status, updated_at, created_at),
  key notification_deliveries_retry_idx (status, next_attempt_at, created_at),
  constraint notification_deliveries_event_fk foreign key (event_id) references notification_event_outbox(id),
  constraint notification_deliveries_recipient_fk foreign key (recipient_membership_id, club_id) references memberships(id, club_id),
  constraint notification_deliveries_channel_check check (channel in ('EMAIL', 'IN_APP')),
  constraint notification_deliveries_status_check check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED')),
  constraint notification_deliveries_attempt_count_check check (attempt_count >= 0),
  constraint notification_deliveries_dedupe_key_check check (length(trim(dedupe_key)) > 0)
);

create table member_notifications (
  id char(36) not null,
  event_id char(36) not null,
  delivery_id char(36) not null,
  club_id char(36) not null,
  recipient_membership_id char(36) not null,
  event_type varchar(60) not null,
  title varchar(160) not null,
  body varchar(500) not null,
  deep_link_path varchar(500) not null,
  read_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key member_notifications_delivery_uk (delivery_id),
  unique key member_notifications_event_recipient_uk (event_id, recipient_membership_id),
  key member_notifications_recipient_read_created_idx (recipient_membership_id, read_at, created_at),
  key member_notifications_club_created_idx (club_id, created_at),
  constraint member_notifications_event_fk foreign key (event_id) references notification_event_outbox(id),
  constraint member_notifications_delivery_fk foreign key (delivery_id) references notification_deliveries(id),
  constraint member_notifications_recipient_fk foreign key (recipient_membership_id, club_id) references memberships(id, club_id),
  constraint member_notifications_title_check check (length(trim(title)) > 0),
  constraint member_notifications_body_check check (length(trim(body)) > 0),
  constraint member_notifications_deep_link_path_check check (deep_link_path like '/%')
);
```

- [x] **Step 4: Run migration tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.support.MySqlFlywayMigrationTest'
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V18__kafka_notification_pipeline.sql server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt
git commit -m "feat: add kafka notification ledger schema"
```

## Task 3: Introduce Notification Domain Models and Ports

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventOutboxStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationDeliveryStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationChannel.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventOutboxPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventPublisherPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/MemberNotificationPort.kt`

- [x] **Step 1: Write model test**

Create `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEventModelsTest.kt`:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class NotificationEventModelsTest {
    @Test
    fun `delivery dedupe key includes event recipient and channel`() {
        val eventId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val recipientId = UUID.fromString("00000000-0000-0000-0000-000000000002")

        assertThat(notificationDeliveryDedupeKey(eventId, recipientId, NotificationChannel.EMAIL))
            .isEqualTo("00000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000002:EMAIL")
    }

    @Test
    fun `event and delivery statuses expose kafka pipeline states`() {
        assertThat(NotificationEventOutboxStatus.entries.map { it.name }).contains(
            "PENDING",
            "PUBLISHING",
            "PUBLISHED",
            "FAILED",
            "DEAD",
        )
        assertThat(NotificationDeliveryStatus.entries.map { it.name }).contains(
            "PENDING",
            "SENDING",
            "SENT",
            "FAILED",
            "DEAD",
            "SKIPPED",
        )
    }

    @Test
    fun `member notification model keeps read state nullable`() {
        val item = MemberNotificationItem(
            id = UUID.randomUUID(),
            eventId = UUID.randomUUID(),
            eventType = com.readmates.notification.domain.NotificationEventType.NEXT_BOOK_PUBLISHED,
            title = "다음 책이 공개되었습니다",
            body = "12회차 책을 확인해 주세요.",
            deepLinkPath = "/sessions/00000000-0000-0000-0000-000000000001",
            readAt = null,
            createdAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
        )

        assertThat(item.isUnread).isTrue()
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEventModelsTest'
```

Expected: FAIL because the new model types do not exist.

- [x] **Step 3: Add domain enums**

Create `NotificationEventOutboxStatus.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationEventOutboxStatus {
    PENDING,
    PUBLISHING,
    PUBLISHED,
    FAILED,
    DEAD,
}
```

Create `NotificationDeliveryStatus.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationDeliveryStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
    DEAD,
    SKIPPED,
}
```

Create `NotificationChannel.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationChannel {
    EMAIL,
    IN_APP,
}
```

- [x] **Step 4: Add application models and helper**

Add these models to `NotificationModels.kt`, keeping existing preference and test mail models until later tasks migrate callers:

```kotlin
data class NotificationEventPayload(
    val sessionId: UUID? = null,
    val sessionNumber: Int? = null,
    val bookTitle: String? = null,
    val documentVersion: Int? = null,
    val authorMembershipId: UUID? = null,
    val targetDate: LocalDate? = null,
)

data class NotificationEventOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val payload: NotificationEventPayload,
    val status: NotificationEventOutboxStatus,
    val kafkaTopic: String,
    val kafkaKey: String,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
)

data class NotificationEventMessage(
    val schemaVersion: Int = 1,
    val eventId: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val occurredAt: OffsetDateTime,
    val payload: NotificationEventPayload,
)

data class NotificationDeliveryItem(
    val id: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val recipientMembershipId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime?,
    val recipientEmail: String?,
    val subject: String?,
    val bodyText: String?,
)

data class MemberNotificationItem(
    val id: UUID,
    val eventId: UUID,
    val eventType: NotificationEventType,
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val readAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
) {
    val isUnread: Boolean = readAt == null
}

data class MemberNotificationList(
    val items: List<MemberNotificationItem>,
    val unreadCount: Int,
)

fun notificationDeliveryDedupeKey(
    eventId: UUID,
    recipientMembershipId: UUID,
    channel: NotificationChannel,
): String = "$eventId:$recipientMembershipId:${channel.name}"
```

Add imports in `NotificationModels.kt`:

```kotlin
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import java.time.LocalDate
```

- [x] **Step 5: Add ports**

Create `NotificationEventOutboxPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventType
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationEventOutboxPort {
    fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean
    fun enqueueSessionReminderDue(targetDate: LocalDate): Int
    fun claimPublishable(limit: Int): List<NotificationEventOutboxItem>
    fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun loadMessage(eventId: UUID): NotificationEventMessage?
}
```

Create `NotificationEventPublisherPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationEventMessage

interface NotificationEventPublisherPort {
    fun publish(message: NotificationEventMessage, topic: String, key: String)
}
```

Create `NotificationDeliveryPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationDeliveryPort {
    fun planDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem>
    fun claimEmailDelivery(id: UUID): NotificationDeliveryItem?
    fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime?): Boolean
    fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime?, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime?, error: String): Boolean
    fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int
}
```

Create `MemberNotificationPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.MemberNotificationItem
import java.util.UUID

interface MemberNotificationPort {
    fun listForMembership(clubId: UUID, membershipId: UUID, limit: Int): List<MemberNotificationItem>
    fun unreadCount(clubId: UUID, membershipId: UUID): Int
    fun markRead(clubId: UUID, membershipId: UUID, notificationId: UUID): Boolean
    fun markAllRead(clubId: UUID, membershipId: UUID): Int
}
```

- [x] **Step 6: Run model tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEventModelsTest'
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/domain server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt server/src/main/kotlin/com/readmates/notification/application/port/out server/src/test/kotlin/com/readmates/notification/application/model/NotificationEventModelsTest.kt
git commit -m "feat: add notification event delivery models"
```

## Task 4: Implement Event Outbox Persistence

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`

- [x] **Step 1: Write failing persistence test**

Create `JdbcNotificationEventOutboxAdapterTest.kt` with tests for idempotent enqueue and claim:

```kotlin
package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

@JdbcTest
@Import(JdbcNotificationEventOutboxAdapter::class)
class JdbcNotificationEventOutboxAdapterTest(
    @Autowired private val adapter: JdbcNotificationEventOutboxAdapter,
    @Autowired private val jdbcTemplate: JdbcTemplate,
) : MySqlTestContainer() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000101")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000201")

    @Test
    fun `enqueue event is idempotent by dedupe key`() {
        insertClub()

        val first = adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = 12, bookTitle = "Example Book"),
            dedupeKey = "next-book:$sessionId",
        )
        val second = adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = 12, bookTitle = "Example Book"),
            dedupeKey = "next-book:$sessionId",
        )

        assertThat(first).isTrue()
        assertThat(second).isFalse()
        assertThat(jdbcTemplate.queryForObject("select count(*) from notification_event_outbox", Int::class.java)).isEqualTo(1)
    }

    @Test
    fun `claim publishable moves pending row to publishing`() {
        insertClub()
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = 12, bookTitle = "Example Book"),
            dedupeKey = "next-book:$sessionId",
        )

        val claimed = adapter.claimPublishable(10)

        assertThat(claimed).hasSize(1)
        assertThat(claimed.single().status).isEqualTo(NotificationEventOutboxStatus.PUBLISHING)
    }

    private fun insertClub() {
        jdbcTemplate.update(
            "insert into clubs (id, name, slug) values (?, ?, ?)",
            clubId.toString(),
            "ReadMates",
            "readmates",
        )
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest'
```

Expected: FAIL because `JdbcNotificationEventOutboxAdapter` does not exist.

- [x] **Step 3: Implement adapter**

Create `JdbcNotificationEventOutboxAdapter.kt`:

```kotlin
package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcNotificationEventOutboxAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    @param:Value("\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}") private val eventsTopic: String,
) : NotificationEventOutboxPort {
    @Transactional
    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean {
        return try {
            jdbcTemplate.update(
                """
                insert into notification_event_outbox (
                  id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
                  kafka_topic, kafka_key, dedupe_key
                )
                values (?, ?, ?, ?, ?, cast(? as json), ?, ?, ?)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                clubId.dbString(),
                eventType.name,
                aggregateType,
                aggregateId.dbString(),
                objectMapper.writeValueAsString(payload),
                eventsTopic,
                clubId.dbString(),
                dedupeKey,
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }
    }

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int = 0

    @Transactional
    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> {
        if (limit <= 0) return emptyList()
        val ids = jdbcTemplate.queryForList(
            """
            select id
            from notification_event_outbox
            where status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            order by next_attempt_at, created_at
            limit ?
            """.trimIndent(),
            String::class.java,
            limit,
        )
        if (ids.isEmpty()) return emptyList()

        val lockedAt = OffsetDateTime.now(ZoneOffset.UTC)
        jdbcTemplate.batchUpdate(
            "update notification_event_outbox set status = 'PUBLISHING', locked_at = ? where id = ? and status in ('PENDING', 'FAILED')",
            ids.map { arrayOf(lockedAt.toUtcLocalDateTime(), it) },
        )
        return ids.mapNotNull { id -> loadClaimed(UUID.fromString(id)) }
    }

    override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean =
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PUBLISHED', published_at = utc_timestamp(6), last_error = null
            where id = ? and locked_at = ? and status = 'PUBLISHING'
            """.trimIndent(),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) == 1

    override fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean =
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'FAILED',
                attempt_count = attempt_count + 1,
                next_attempt_at = timestampadd(minute, ?, utc_timestamp(6)),
                last_error = ?
            where id = ? and locked_at = ? and status = 'PUBLISHING'
            """.trimIndent(),
            nextAttemptDelayMinutes,
            error.take(500),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) == 1

    override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'DEAD', attempt_count = attempt_count + 1, last_error = ?
            where id = ? and locked_at = ? and status = 'PUBLISHING'
            """.trimIndent(),
            error.take(500),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) == 1

    override fun loadMessage(eventId: UUID): NotificationEventMessage? =
        jdbcTemplate.query(
            """
            select id, club_id, event_type, aggregate_type, aggregate_id, payload_json, created_at
            from notification_event_outbox
            where id = ?
            """.trimIndent(),
            { rs, _ -> rs.toMessage() },
            eventId.dbString(),
        ).firstOrNull()

    private fun loadClaimed(id: UUID): NotificationEventOutboxItem? =
        jdbcTemplate.query(
            """
            select id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
                   kafka_topic, kafka_key, attempt_count, locked_at
            from notification_event_outbox
            where id = ?
            """.trimIndent(),
            { rs, _ -> rs.toOutboxItem() },
            id.dbString(),
        ).firstOrNull()

    private fun ResultSet.toOutboxItem(): NotificationEventOutboxItem =
        NotificationEventOutboxItem(
            id = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            payload = objectMapper.readValue(getString("payload_json"), NotificationEventPayload::class.java),
            status = NotificationEventOutboxStatus.valueOf(getString("status")),
            kafkaTopic = getString("kafka_topic"),
            kafkaKey = getString("kafka_key"),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTime("locked_at"),
        )

    private fun ResultSet.toMessage(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            occurredAt = utcOffsetDateTime("created_at"),
            payload = objectMapper.readValue(getString("payload_json"), NotificationEventPayload::class.java),
        )
}
```

- [x] **Step 4: Run adapter test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest'
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt
git commit -m "feat: persist notification event outbox"
```

## Task 5: Implement Kafka Publisher and Relay Scheduler

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationEventRelayScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationRelayServiceTest.kt`

- [x] **Step 1: Write relay service test**

Create `NotificationRelayServiceTest.kt` with fake ports:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class NotificationRelayServiceTest {
    @Test
    fun `publish pending events marks them published`() {
        val outbox = FakeEventOutbox()
        val publisher = RecordingPublisher()
        val service = NotificationRelayService(outbox, publisher, maxAttempts = 5)

        val count = service.publishPending(10)

        assertThat(count).isEqualTo(1)
        assertThat(publisher.published).hasSize(1)
        assertThat(outbox.publishedIds).containsExactly(outbox.item.id)
    }

    private class RecordingPublisher : NotificationEventPublisherPort {
        val published = mutableListOf<NotificationEventMessage>()
        override fun publish(message: NotificationEventMessage, topic: String, key: String) {
            published += message
        }
    }

    private class FakeEventOutbox : NotificationEventOutboxPort {
        val item = NotificationEventOutboxItem(
            id = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = UUID.randomUUID(),
            payload = NotificationEventPayload(sessionNumber = 12, bookTitle = "Example Book"),
            status = NotificationEventOutboxStatus.PUBLISHING,
            kafkaTopic = "readmates.notification.events.v1",
            kafkaKey = UUID.randomUUID().toString(),
            attemptCount = 0,
            lockedAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
        )
        val publishedIds = mutableListOf<UUID>()

        override fun claimPublishable(limit: Int) = listOf(item)
        override fun loadMessage(eventId: UUID) = NotificationEventMessage(
            eventId = item.id,
            clubId = item.clubId,
            eventType = item.eventType,
            aggregateType = item.aggregateType,
            aggregateId = item.aggregateId,
            occurredAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
            payload = item.payload,
        )
        override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean {
            publishedIds += id
            return true
        }
        override fun enqueueEvent(clubId: UUID, eventType: NotificationEventType, aggregateType: String, aggregateId: UUID, payload: NotificationEventPayload, dedupeKey: String) = true
        override fun enqueueSessionReminderDue(targetDate: LocalDate) = 0
        override fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long) = true
        override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String) = true
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationRelayServiceTest'
```

Expected: FAIL because `NotificationRelayService` does not exist.

- [x] **Step 3: Add use case and service**

In `NotificationUseCases.kt`, add:

```kotlin
interface PublishNotificationEventsUseCase {
    fun publishPending(limit: Int): Int
}
```

Create `NotificationRelayService.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

private val RELAY_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
class NotificationRelayService(
    private val outboxPort: NotificationEventOutboxPort,
    private val publisherPort: NotificationEventPublisherPort,
    @param:Value("\${readmates.notifications.kafka.max-publish-attempts:5}") private val maxAttempts: Int,
) : PublishNotificationEventsUseCase {
    override fun publishPending(limit: Int): Int {
        if (limit <= 0) return 0
        val events = outboxPort.claimPublishable(limit)
        events.forEach { item ->
            val message = outboxPort.loadMessage(item.id)
            if (message == null) {
                outboxPort.markPublishDead(item.id, item.lockedAt, "Notification event message missing")
                return@forEach
            }
            try {
                publisherPort.publish(message, item.kafkaTopic, item.kafkaKey)
                outboxPort.markPublished(item.id, item.lockedAt)
            } catch (exception: Exception) {
                val error = (exception.message ?: exception.javaClass.simpleName).take(500)
                if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
                    outboxPort.markPublishDead(item.id, item.lockedAt, error)
                } else {
                    outboxPort.markPublishFailed(item.id, item.lockedAt, error, retryDelayMinutes(item.attemptCount))
                }
            }
        }
        return events.size
    }

    private fun retryDelayMinutes(attemptCount: Int): Long =
        RELAY_RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, RELAY_RETRY_DELAYS_MINUTES.lastIndex)]
}
```

- [x] **Step 4: Add Kafka publisher adapter**

Create `KafkaNotificationEventPublisherAdapter.kt`:

```kotlin
package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.support.MessageBuilder
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class KafkaNotificationEventPublisherAdapter(
    private val kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
) : NotificationEventPublisherPort {
    override fun publish(message: NotificationEventMessage, topic: String, key: String) {
        val kafkaMessage = MessageBuilder.withPayload(message)
            .setHeader(KafkaHeaders.TOPIC, topic)
            .setHeader(KafkaHeaders.KEY, key)
            .setHeader("readmates-schema-version", message.schemaVersion.toString())
            .setHeader("readmates-event-id", message.eventId.toString())
            .setHeader("readmates-event-type", message.eventType.name)
            .build()
        kafkaTemplate.send(kafkaMessage).get()
    }
}
```

- [x] **Step 5: Replace scheduler**

Create `NotificationEventRelayScheduler.kt`:

```kotlin
package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventRelayScheduler(
    private val publishNotificationEventsUseCase: PublishNotificationEventsUseCase,
    @param:Value("\${readmates.notifications.kafka.relay-batch-size:50}") private val batchSize: Int,
) {
    @Scheduled(fixedDelayString = "\${readmates.notifications.worker.fixed-delay-ms:30000}")
    fun publish() {
        publishNotificationEventsUseCase.publishPending(batchSize)
    }
}
```

Leave `NotificationOutboxScheduler` in place until Task 10 removes old references, but disable its worker property in configuration so Kafka is the new path.

- [x] **Step 6: Run relay tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationRelayServiceTest'
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationEventRelayScheduler.kt server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt server/src/test/kotlin/com/readmates/notification/application/service/NotificationRelayServiceTest.kt
git commit -m "feat: publish notification events to kafka"
```

## Task 6: Implement Delivery Planning, Email Dispatch, and In-App Creation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcMemberNotificationAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`

- [x] **Step 1: Write dispatch service unit test**

Create `NotificationDispatchServiceTest.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class NotificationDispatchServiceTest {
    @Test
    fun `dispatch sends pending email delivery and marks it sent`() {
        val deliveryPort = FakeDeliveryPort()
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        service.dispatch(message())

        assertThat(mailPort.sent).hasSize(1)
        assertThat(deliveryPort.sent).containsExactly(deliveryPort.emailDelivery.id)
    }

    private fun message() = NotificationEventMessage(
        eventId = UUID.randomUUID(),
        clubId = UUID.randomUUID(),
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "SESSION",
        aggregateId = UUID.randomUUID(),
        occurredAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
        payload = NotificationEventPayload(sessionNumber = 12, bookTitle = "Example Book"),
    )

    private class FakeDeliveryPort : NotificationDeliveryPort {
        val emailDelivery = NotificationDeliveryItem(
            id = UUID.randomUUID(),
            eventId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            recipientMembershipId = UUID.randomUUID(),
            channel = NotificationChannel.EMAIL,
            status = NotificationDeliveryStatus.PENDING,
            attemptCount = 0,
            lockedAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
            recipientEmail = "member@example.com",
            subject = "다음 책이 공개되었습니다",
            bodyText = "12회차 책을 확인해 주세요.",
        )
        val sent = mutableListOf<UUID>()

        override fun planDeliveries(message: NotificationEventMessage) = listOf(emailDelivery)
        override fun claimEmailDelivery(id: UUID) = emailDelivery
        override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime?): Boolean {
            sent += id
            return true
        }
        override fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime?, error: String, nextAttemptDelayMinutes: Long) = true
        override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime?, error: String) = true
        override fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus) = 0
    }

    private class RecordingMailPort : MailDeliveryPort {
        val sent = mutableListOf<MailDeliveryCommand>()
        override fun send(command: MailDeliveryCommand) {
            sent += command
        }
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationDispatchServiceTest'
```

Expected: FAIL because `NotificationDispatchService` does not exist.

- [x] **Step 3: Implement dispatch service**

Create `NotificationDispatchService.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

private val DELIVERY_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
class NotificationDispatchService(
    private val deliveryPort: NotificationDeliveryPort,
    private val mailDeliveryPort: MailDeliveryPort,
    @param:Value("\${readmates.notifications.kafka.max-delivery-attempts:5}") private val maxAttempts: Int,
) : DispatchNotificationEventUseCase {
    override fun dispatch(message: NotificationEventMessage) {
        val deliveries = deliveryPort.planDeliveries(message)
        deliveries.filter { it.channel == NotificationChannel.EMAIL }.forEach { delivery ->
            val claimed = deliveryPort.claimEmailDelivery(delivery.id) ?: return@forEach
            try {
                mailDeliveryPort.send(
                    MailDeliveryCommand(
                        to = requireNotNull(claimed.recipientEmail),
                        subject = requireNotNull(claimed.subject),
                        text = requireNotNull(claimed.bodyText),
                    ),
                )
                deliveryPort.markDeliverySent(claimed.id, claimed.lockedAt)
            } catch (exception: Exception) {
                val error = (exception.message ?: exception.javaClass.simpleName).take(500)
                if (claimed.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
                    deliveryPort.markDeliveryDead(claimed.id, claimed.lockedAt, error)
                } else {
                    deliveryPort.markDeliveryFailed(claimed.id, claimed.lockedAt, error, retryDelayMinutes(claimed.attemptCount))
                    throw exception
                }
            }
        }
    }

    private fun retryDelayMinutes(attemptCount: Int): Long =
        DELIVERY_RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, DELIVERY_RETRY_DELAYS_MINUTES.lastIndex)]
}
```

- [x] **Step 4: Add Kafka listener**

In `NotificationUseCases.kt`, add:

```kotlin
interface DispatchNotificationEventUseCase {
    fun dispatch(message: NotificationEventMessage)
}
```

Create `NotificationEventKafkaListener.kt`:

```kotlin
package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventKafkaListener(
    private val dispatchNotificationEventUseCase: DispatchNotificationEventUseCase,
) {
    @KafkaListener(
        topics = ["\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}"],
        groupId = "\${readmates.notifications.kafka.consumer-group:readmates-notification-dispatcher}",
    )
    fun onMessage(message: NotificationEventMessage) {
        if (message.schemaVersion != 1) {
            throw IllegalArgumentException("Unsupported notification event schema version ${message.schemaVersion}")
        }
        dispatchNotificationEventUseCase.dispatch(message)
    }
}
```

- [x] **Step 5: Implement persistence adapters**

Implement `JdbcNotificationDeliveryAdapter` to:

- Insert `IN_APP` and `EMAIL` deliveries with unique `dedupe_key`.
- Render title/body/deep link from event type and payload.
- Create `member_notifications` for `IN_APP`.
- Mark `IN_APP` delivery as `SENT`.
- Return `EMAIL` delivery rows with recipient email, subject, and body.
- Write `SKIPPED` email rows when preference is off.

Implement `JdbcMemberNotificationAdapter` with list, unread count, mark read, and mark all read methods matching `MemberNotificationPort`.

- [x] **Step 6: Run service tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationDispatchServiceTest'
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcMemberNotificationAdapter.kt server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt
git commit -m "feat: dispatch kafka notification deliveries"
```

## Task 7: Replace Event Recording Callers

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt`
- Modify callers currently using `RecordNotificationEventUseCase`:
  - `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
  - `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
  - review publication caller found with `rg "recordReviewPublished" server/src/main/kotlin`
- Test: update existing service tests that assert notification enqueue behavior.

- [x] **Step 1: Write event service tests**

Create `server/src/test/kotlin/com/readmates/notification/application/service/NotificationEventServiceTest.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class NotificationEventServiceTest {
    @Test
    fun `feedback document event uses session and version dedupe key`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        service.recordFeedbackDocumentPublished(clubId, sessionId, documentVersion = 3)

        assertThat(outbox.recorded.single().dedupeKey).isEqualTo("feedback-document:$sessionId:3")
    }

    private class RecordingEventOutbox : NotificationEventOutboxPort {
        data class Recorded(val eventType: NotificationEventType, val dedupeKey: String)
        val recorded = mutableListOf<Recorded>()
        override fun enqueueEvent(clubId: UUID, eventType: NotificationEventType, aggregateType: String, aggregateId: UUID, payload: NotificationEventPayload, dedupeKey: String): Boolean {
            recorded += Recorded(eventType, dedupeKey)
            return true
        }
        override fun enqueueSessionReminderDue(targetDate: LocalDate) = 0
        override fun claimPublishable(limit: Int) = emptyList<com.readmates.notification.application.model.NotificationEventOutboxItem>()
        override fun markPublished(id: UUID, lockedAt: OffsetDateTime) = false
        override fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long) = false
        override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String) = false
        override fun loadMessage(eventId: UUID) = null
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationEventServiceTest'
```

Expected: FAIL because `NotificationEventService` does not exist or the method signature is still old.

- [x] **Step 3: Implement event service**

Create `NotificationEventService.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventType
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

@Service
class NotificationEventService(
    private val eventOutboxPort: NotificationEventOutboxPort,
) : RecordNotificationEventUseCase {
    override fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID, documentVersion: Int) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, documentVersion = documentVersion),
            dedupeKey = "feedback-document:$sessionId:$documentVersion",
        )
    }

    override fun recordNextBookPublished(clubId: UUID, sessionId: UUID, sessionNumber: Int, bookTitle: String) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = sessionNumber, bookTitle = bookTitle),
            dedupeKey = "next-book:$sessionId",
        )
    }

    override fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.REVIEW_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, authorMembershipId = authorMembershipId),
            dedupeKey = "review-published:$sessionId:$authorMembershipId",
        )
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        eventOutboxPort.enqueueSessionReminderDue(targetDate)
    }
}
```

Update `RecordNotificationEventUseCase` signatures in `NotificationUseCases.kt`:

```kotlin
interface RecordNotificationEventUseCase {
    fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID, documentVersion: Int)
    fun recordNextBookPublished(clubId: UUID, sessionId: UUID, sessionNumber: Int, bookTitle: String)
    fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID)
    fun recordSessionReminderDue(targetDate: LocalDate)
}
```

- [x] **Step 4: Update callers**

For each caller, pass the new metadata:

```kotlin
recordNotificationEventUseCase.recordNextBookPublished(
    clubId = saved.clubId,
    sessionId = saved.id,
    sessionNumber = saved.number,
    bookTitle = saved.bookTitle,
)
```

For feedback document upload, pass the stored document version:

```kotlin
recordNotificationEventUseCase.recordFeedbackDocumentPublished(
    clubId = saved.clubId,
    sessionId = saved.sessionId,
    documentVersion = saved.version,
)
```

- [x] **Step 5: Run targeted server tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.NotificationEventServiceTest' --tests 'com.readmates.session.*' --tests 'com.readmates.feedback.*'
```

Expected: PASS or fail only on tests that still assert old outbox row shapes. Update those assertions to check event outbox rows.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt server/src/test/kotlin/com/readmates/notification/application/service/NotificationEventServiceTest.kt server/src/test/kotlin
git commit -m "feat: record notification domain events"
```

## Task 8: Add Member Notification API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/MemberNotificationService.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationControllerTest.kt`

- [x] **Step 1: Write controller test**

Create `MemberNotificationControllerTest.kt`:

```kotlin
package com.readmates.notification.api

import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.OffsetDateTime
import java.util.UUID

@WebMvcTest
@Import(MemberNotificationControllerTest.TestConfig::class)
class MemberNotificationControllerTest(
    private val mockMvc: MockMvc,
) {
    @Test
    fun `list current member notifications`() {
        mockMvc.get("/api/me/notifications")
            .andExpect {
                status { isOk() }
                jsonPath("$.unreadCount") { value(1) }
                jsonPath("$.items[0].title") { value("다음 책이 공개되었습니다") }
            }
    }

    class TestConfig {
        @Bean
        fun useCase(): ManageMemberNotificationsUseCase = object : ManageMemberNotificationsUseCase {
            override fun list(member: CurrentMember, limit: Int) = MemberNotificationList(
                items = listOf(
                    MemberNotificationItem(
                        id = UUID.randomUUID(),
                        eventId = UUID.randomUUID(),
                        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                        title = "다음 책이 공개되었습니다",
                        body = "12회차 책을 확인해 주세요.",
                        deepLinkPath = "/sessions/00000000-0000-0000-0000-000000000001",
                        readAt = null,
                        createdAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
                    ),
                ),
                unreadCount = 1,
            )
            override fun unreadCount(member: CurrentMember) = 1
            override fun markRead(member: CurrentMember, id: UUID) = Unit
            override fun markAllRead(member: CurrentMember) = 1
        }
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.MemberNotificationControllerTest'
```

Expected: FAIL because `ManageMemberNotificationsUseCase` and endpoints do not exist.

- [x] **Step 3: Add use case and service**

In `NotificationUseCases.kt`, add:

```kotlin
interface ManageMemberNotificationsUseCase {
    fun list(member: CurrentMember, limit: Int): MemberNotificationList
    fun unreadCount(member: CurrentMember): Int
    fun markRead(member: CurrentMember, id: UUID)
    fun markAllRead(member: CurrentMember): Int
}
```

Create `MemberNotificationService.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.port.`in`.ManageMemberNotificationsUseCase
import com.readmates.notification.application.port.out.MemberNotificationPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus
import java.util.UUID

@Service
class MemberNotificationService(
    private val memberNotificationPort: MemberNotificationPort,
) : ManageMemberNotificationsUseCase {
    override fun list(member: CurrentMember, limit: Int): MemberNotificationList =
        MemberNotificationList(
            items = memberNotificationPort.listForMembership(member.clubId, member.membershipId, limit.coerceIn(1, 100)),
            unreadCount = memberNotificationPort.unreadCount(member.clubId, member.membershipId),
        )

    override fun unreadCount(member: CurrentMember): Int =
        memberNotificationPort.unreadCount(member.clubId, member.membershipId)

    override fun markRead(member: CurrentMember, id: UUID) {
        if (!memberNotificationPort.markRead(member.clubId, member.membershipId, id)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found")
        }
    }

    override fun markAllRead(member: CurrentMember): Int =
        memberNotificationPort.markAllRead(member.clubId, member.membershipId)
}
```

- [x] **Step 4: Add DTOs and endpoints**

Add DTOs to `NotificationWebDtos.kt`:

```kotlin
data class MemberNotificationListResponse(
    val unreadCount: Int,
    val items: List<MemberNotificationResponse>,
)

data class MemberNotificationResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val readAt: String?,
    val createdAt: String,
)

fun MemberNotificationList.toResponse(): MemberNotificationListResponse =
    MemberNotificationListResponse(
        unreadCount = unreadCount,
        items = items.map {
            MemberNotificationResponse(
                id = it.id,
                eventType = it.eventType,
                title = it.title,
                body = it.body,
                deepLinkPath = it.deepLinkPath,
                readAt = it.readAt?.toString(),
                createdAt = it.createdAt.toString(),
            )
        },
    )
```

Extend `MemberNotificationController.kt`:

```kotlin
@GetMapping
fun list(member: CurrentMember, @RequestParam(defaultValue = "50") limit: Int): MemberNotificationListResponse =
    manageMemberNotificationsUseCase.list(member, limit).toResponse()

@GetMapping("/unread-count")
fun unreadCount(member: CurrentMember): Map<String, Int> =
    mapOf("unreadCount" to manageMemberNotificationsUseCase.unreadCount(member))

@PostMapping("/{id}/read")
@ResponseStatus(HttpStatus.NO_CONTENT)
fun markRead(member: CurrentMember, @PathVariable id: UUID) {
    manageMemberNotificationsUseCase.markRead(member, id)
}

@PostMapping("/read-all")
fun markAllRead(member: CurrentMember): Map<String, Int> =
    mapOf("updatedCount" to manageMemberNotificationsUseCase.markAllRead(member))
```

Make sure controller class request mapping is:

```kotlin
@RequestMapping("/api/me/notifications")
```

- [x] **Step 5: Run controller test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.MemberNotificationControllerTest'
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt server/src/main/kotlin/com/readmates/notification/application/service/MemberNotificationService.kt server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt server/src/test/kotlin/com/readmates/notification/api/MemberNotificationControllerTest.kt
git commit -m "feat: add member notification inbox api"
```

## Task 9: Update Host Notification Operations API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Create or modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostNotificationOperationsService.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [x] **Step 1: Update host controller tests**

In `HostNotificationControllerTest.kt`, replace old outbox item assertions with event/delivery assertions:

```kotlin
mockMvc.get("/api/host/notifications/events")
    .andExpect {
        status { isOk() }
        jsonPath("$.items[0].eventType") { value("NEXT_BOOK_PUBLISHED") }
        jsonPath("$.items[0].status") { value("PUBLISHED") }
    }

mockMvc.get("/api/host/notifications/deliveries")
    .andExpect {
        status { isOk() }
        jsonPath("$.items[0].channel") { value("EMAIL") }
        jsonPath("$.items[0].recipientEmail") { value("m***@example.com") }
    }
```

- [x] **Step 2: Run host notification tests to verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: FAIL because event and delivery endpoints do not exist.

- [x] **Step 3: Add host DTOs**

Add response DTOs:

```kotlin
data class HostNotificationEventListResponse(val items: List<HostNotificationEventResponse>)
data class HostNotificationEventResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val createdAt: String,
    val updatedAt: String,
)

data class HostNotificationDeliveryListResponse(val items: List<HostNotificationDeliveryResponse>)
data class HostNotificationDeliveryResponse(
    val id: UUID,
    val eventId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val recipientEmail: String?,
    val attemptCount: Int,
    val updatedAt: String,
)
```

- [x] **Step 4: Add endpoints**

In `HostNotificationController.kt`, add:

```kotlin
@GetMapping("/events")
fun events(
    member: CurrentMember,
    @RequestParam(required = false) status: NotificationEventOutboxStatus?,
    @RequestParam(defaultValue = "50") limit: Int,
): HostNotificationEventListResponse =
    manageHostNotificationsUseCase.listEvents(member, status, limit).toResponse()

@GetMapping("/deliveries")
fun deliveries(
    member: CurrentMember,
    @RequestParam(required = false) status: NotificationDeliveryStatus?,
    @RequestParam(required = false) channel: NotificationChannel?,
    @RequestParam(defaultValue = "50") limit: Int,
): HostNotificationDeliveryListResponse =
    manageHostNotificationsUseCase.listDeliveries(member, status, channel, limit).toResponse()
```

Keep existing test mail endpoints.

- [x] **Step 5: Implement host operations service methods**

Extend `ManageHostNotificationsUseCase` with:

```kotlin
fun listEvents(host: CurrentMember, status: NotificationEventOutboxStatus?, limit: Int): HostNotificationEventList
fun listDeliveries(host: CurrentMember, status: NotificationDeliveryStatus?, channel: NotificationChannel?, limit: Int): HostNotificationDeliveryList
```

Implement methods in `HostNotificationOperationsService`, requiring `host.isHost` and always scoping by `host.clubId`.

- [x] **Step 6: Run host tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt server/src/main/kotlin/com/readmates/notification/application/service/HostNotificationOperationsService.kt server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: expose notification event delivery ledger"
```

## Task 10: Remove JDBC Direct Delivery Worker and Legacy Port Usage

**Files:**
- Delete or stop using: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxScheduler.kt`
- Delete or stop using: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Delete or stop using: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Delete or stop using: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Update tests under `server/src/test/kotlin/com/readmates/notification`.

- [x] **Step 1: Add architecture assertion**

In `ServerArchitectureBoundaryTest.kt`, add a test assertion that application services do not depend on `NotificationOutboxPort`:

```kotlin
noClasses()
    .that().resideInAPackage("..notification.application..")
    .should().dependOnClassesThat().haveSimpleName("NotificationOutboxPort")
    .check(importedClasses)
```

If the boundary test uses a helper style, add the same rule using the existing helper conventions.

- [x] **Step 2: Run architecture test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

Expected: FAIL while old service and port still exist.

- [x] **Step 3: Remove old worker path**

Delete the old direct worker files after replacement code compiles:

```bash
git rm server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxScheduler.kt
git rm server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt
git rm server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt
git rm server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt
```

Update all imports and tests to use new services and ports.

- [x] **Step 4: Run notification server tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.*'
```

Expected: PASS.

- [x] **Step 5: Run architecture test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "refactor: remove jdbc notification delivery worker"
```

## Task 11: Add Frontend Member Notification Inbox

**Files:**
- Create: `front/features/notifications/api/notifications-contracts.ts`
- Create: `front/features/notifications/api/notifications-api.ts`
- Create: `front/features/notifications/ui/member-notifications-page.tsx`
- Create: `front/features/notifications/route/member-notifications-route.tsx`
- Modify: `front/src/app/router.tsx`
- Modify app chrome badge component found with `rg "mobile-header|mobile-tab|TopNav|notification" front/src front/shared front/features`.
- Test: `front/tests/unit/member-notifications.test.tsx`

- [ ] **Step 1: Write failing unit test**

Create `front/tests/unit/member-notifications.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberNotificationsPage } from "@/features/notifications/ui/member-notifications-page";

describe("MemberNotificationsPage", () => {
  it("renders unread notification rows", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[
          {
            id: "00000000-0000-0000-0000-000000000001",
            eventType: "NEXT_BOOK_PUBLISHED",
            title: "다음 책이 공개되었습니다",
            body: "12회차 책을 확인해 주세요.",
            deepLinkPath: "/sessions/00000000-0000-0000-0000-000000000002",
            readAt: null,
            createdAt: "2026-04-29T00:00:00Z",
          },
        ]}
        onMarkRead={() => undefined}
        onMarkAllRead={() => undefined}
      />,
    );

    expect(screen.getByText("알림")).toBeInTheDocument();
    expect(screen.getByText("다음 책이 공개되었습니다")).toBeInTheDocument();
    expect(screen.getByText("읽지 않은 알림 1개")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir front test -- member-notifications.test.tsx
```

Expected: FAIL because the notifications feature does not exist.

- [ ] **Step 3: Add contracts and API**

Create `notifications-contracts.ts`:

```ts
import type { NotificationEventType } from "@/features/host/api/host-contracts";

export interface MemberNotification {
  id: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  deepLinkPath: string;
  readAt: string | null;
  createdAt: string;
}

export interface MemberNotificationListResponse {
  unreadCount: number;
  items: MemberNotification[];
}
```

Create `notifications-api.ts`:

```ts
import { readmatesFetch } from "@/shared/api/client";
import type { MemberNotificationListResponse } from "./notifications-contracts";

export async function fetchMemberNotifications(): Promise<MemberNotificationListResponse> {
  return readmatesFetch<MemberNotificationListResponse>("/api/bff/me/notifications");
}

export async function markMemberNotificationRead(id: string): Promise<void> {
  await readmatesFetch<void>(`/api/bff/me/notifications/${id}/read`, { method: "POST" });
}

export async function markAllMemberNotificationsRead(): Promise<{ updatedCount: number }> {
  return readmatesFetch<{ updatedCount: number }>("/api/bff/me/notifications/read-all", { method: "POST" });
}
```

- [ ] **Step 4: Add UI**

Create `member-notifications-page.tsx`:

```tsx
import type { MemberNotification } from "../api/notifications-contracts";

interface MemberNotificationsPageProps {
  unreadCount: number;
  items: MemberNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function MemberNotificationsPage({
  unreadCount,
  items,
  onMarkRead,
  onMarkAllRead,
}: MemberNotificationsPageProps) {
  return (
    <main className="app-page">
      <header className="app-page__header">
        <div>
          <p className="eyebrow">ReadMates</p>
          <h1>알림</h1>
          <p>{unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "새 알림이 없습니다"}</p>
        </div>
        <button type="button" className="button button--secondary" onClick={onMarkAllRead} disabled={unreadCount === 0}>
          모두 읽음
        </button>
      </header>
      <section className="stack">
        {items.length === 0 ? (
          <p className="muted">아직 받은 알림이 없습니다.</p>
        ) : (
          items.map((item) => (
            <article className="list-card" data-unread={item.readAt === null} key={item.id}>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </div>
              {item.readAt === null ? (
                <button type="button" className="button button--ghost" onClick={() => onMarkRead(item.id)}>
                  읽음
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add route**

Create `member-notifications-route.tsx`:

```tsx
import { useLoaderData, useNavigate } from "react-router-dom";
import {
  fetchMemberNotifications,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "../api/notifications-api";
import type { MemberNotificationListResponse } from "../api/notifications-contracts";
import { MemberNotificationsPage } from "../ui/member-notifications-page";

export async function memberNotificationsLoader() {
  return fetchMemberNotifications();
}

export function MemberNotificationsRoute() {
  const data = useLoaderData() as MemberNotificationListResponse;
  const navigate = useNavigate();

  return (
    <MemberNotificationsPage
      unreadCount={data.unreadCount}
      items={data.items}
      onMarkRead={(id) => {
        void markMemberNotificationRead(id).then(() => navigate(0));
      }}
      onMarkAllRead={() => {
        void markAllMemberNotificationsRead().then(() => navigate(0));
      }}
    />
  );
}
```

Add route in `front/src/app/router.tsx`:

```tsx
{
  path: "notifications",
  loader: memberNotificationsLoader,
  element: <MemberNotificationsRoute />,
}
```

Import the route symbols at the top of `router.tsx`.

- [ ] **Step 6: Run frontend unit test**

Run:

```bash
pnpm --dir front test -- member-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/notifications front/src/app/router.tsx front/tests/unit/member-notifications.test.tsx
git commit -m "feat: add member notification inbox"
```

## Task 12: Update Host Notification UI for Event and Delivery Tabs

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`
- Modify: `front/tests/unit/api-contract-fixtures.ts`
- Modify: `front/tests/unit/api-contract-fixtures.test.ts`

- [ ] **Step 1: Update failing host UI test**

In `host-notifications.test.tsx`, assert event and delivery tabs:

```tsx
expect(screen.getByRole("tab", { name: "이벤트" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "배송" })).toBeInTheDocument();
expect(screen.getByText("Kafka 발행 대기")).toBeInTheDocument();
expect(screen.getByText("EMAIL")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: FAIL because the current page still uses the old outbox item contract.

- [ ] **Step 3: Add contracts**

In `host-contracts.ts`, add:

```ts
export type NotificationEventOutboxStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
export type NotificationDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD" | "SKIPPED";
export type NotificationChannel = "EMAIL" | "IN_APP";

export interface HostNotificationEventItem {
  id: string;
  eventType: NotificationEventType;
  status: NotificationEventOutboxStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HostNotificationDeliveryItem {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  recipientEmail: string | null;
  attemptCount: number;
  updatedAt: string;
}

export interface HostNotificationEventListResponse {
  items: HostNotificationEventItem[];
}

export interface HostNotificationDeliveryListResponse {
  items: HostNotificationDeliveryItem[];
}
```

- [ ] **Step 4: Add API calls**

In `host-api.ts`, add:

```ts
export async function fetchHostNotificationEvents(): Promise<HostNotificationEventListResponse> {
  return readmatesFetch<HostNotificationEventListResponse>("/api/bff/host/notifications/events");
}

export async function fetchHostNotificationDeliveries(): Promise<HostNotificationDeliveryListResponse> {
  return readmatesFetch<HostNotificationDeliveryListResponse>("/api/bff/host/notifications/deliveries");
}
```

- [ ] **Step 5: Update route data**

In `host-notifications-data.ts`, load events and deliveries in parallel:

```ts
const [summary, events, deliveries, testMailAudit] = await Promise.all([
  fetchHostNotificationSummary(),
  fetchHostNotificationEvents(),
  fetchHostNotificationDeliveries(),
  fetchHostNotificationTestMailAudit(),
]);

return { summary, events, deliveries, testMailAudit };
```

- [ ] **Step 6: Update UI**

Render event and delivery sections in `host-notifications-page.tsx`:

```tsx
<section aria-label="이벤트">
  <h2>이벤트</h2>
  {events.items.map((event) => (
    <article className="list-card" key={event.id}>
      <strong>{event.eventType}</strong>
      <span>{event.status === "PENDING" ? "Kafka 발행 대기" : event.status}</span>
    </article>
  ))}
</section>

<section aria-label="배송">
  <h2>배송</h2>
  {deliveries.items.map((delivery) => (
    <article className="list-card" key={delivery.id}>
      <strong>{delivery.channel}</strong>
      <span>{delivery.status}</span>
      {delivery.recipientEmail ? <span>{delivery.recipientEmail}</span> : null}
    </article>
  ))}
</section>
```

Keep existing test mail UI.

- [ ] **Step 7: Run host UI tests**

Run:

```bash
pnpm --dir front test -- host-notifications.test.tsx api-contract-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/host front/tests/unit/host-notifications.test.tsx front/tests/unit/api-contract-fixtures.ts front/tests/unit/api-contract-fixtures.test.ts
git commit -m "feat: show kafka notification ledger"
```

## Task 13: End-to-End Kafka Pipeline Test

**Files:**
- Create: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`
- Modify: `server/src/test/resources/application.yml` if test properties are needed.

- [ ] **Step 1: Write integration test**

Create `NotificationKafkaPipelineIntegrationTest.kt`:

```kotlin
package com.readmates.notification.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.KafkaTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.OffsetDateTime
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import org.awaitility.Awaitility.await

@SpringBootTest
class NotificationKafkaPipelineIntegrationTest {
    @Autowired lateinit var publisher: NotificationEventPublisherPort

    @Test
    fun `publisher sends versioned notification event to kafka`() {
        val message = NotificationEventMessage(
            eventId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = UUID.randomUUID(),
            occurredAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
            payload = NotificationEventPayload(sessionNumber = 12, bookTitle = "Example Book"),
        )

        publisher.publish(message, "readmates.notification.events.v1", message.clubId.toString())

        await().atMost(10, TimeUnit.SECONDS).untilAsserted {
            assertThat(TestKafkaSink.messages.map { it.eventId }).contains(message.eventId)
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun kafkaProperties(registry: DynamicPropertyRegistry) {
            registry.add("readmates.notifications.kafka.enabled") { "true" }
            registry.add("spring.kafka.bootstrap-servers") { KafkaTestContainer.container.bootstrapServers }
            registry.add("readmates.notifications.kafka.bootstrap-servers") { KafkaTestContainer.container.bootstrapServers }
        }
    }
}

object TestKafkaSink {
    val messages = CopyOnWriteArrayList<NotificationEventMessage>()

    @KafkaListener(topics = ["readmates.notification.events.v1"], groupId = "readmates-notification-test-sink")
    fun onMessage(message: NotificationEventMessage) {
        messages += message
    }
}
```

- [ ] **Step 2: Add Awaitility dependency if absent**

If the test does not compile because Awaitility is missing, add to `server/build.gradle.kts`:

```kotlin
testImplementation("org.awaitility:awaitility-kotlin:4.2.2")
```

- [ ] **Step 3: Run integration test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest'
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt server/build.gradle.kts server/src/test/resources/application.yml
git commit -m "test: cover kafka notification pipeline"
```

## Task 14: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/deploy/oci-backend.md`

- [ ] **Step 1: Update README highlight**

Change the notification line in `README.md` to:

```markdown
- 운영 파이프라인: MySQL transactional event outbox, Kafka relay/consumer 기반 이메일·인앱 알림, Micrometer/Prometheus 운영 지표, OCI Object Storage 백업 업로드를 지원합니다.
```

- [ ] **Step 2: Update architecture notification section**

In `docs/development/architecture.md`, replace the notification slice summary with:

```markdown
Notification slice는 도메인 이벤트 outbox를 MySQL source of truth로 저장하고, Kafka relay가 `readmates.notification.events.v1` topic으로 발행한다. Kafka consumer는 같은 Spring Boot 모듈 안에서 이벤트를 받아 수신자 계산, preference 적용, 인앱 알림 생성, 이메일 발송을 처리한다. 이벤트 발행 상태는 `notification_event_outbox`, 채널별 배송 상태는 `notification_deliveries`, 멤버 알림함은 `member_notifications`에 남긴다.
```

- [ ] **Step 3: Update local setup**

Add Kafka local command to `docs/development/local-setup.md`:

```bash
docker compose up -d mysql kafka
```

Add env example:

```bash
READMATES_NOTIFICATIONS_ENABLED=true \
READMATES_KAFKA_ENABLED=true \
READMATES_KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

- [ ] **Step 4: Update test guide**

Add:

```markdown
Kafka notification tests use Testcontainers Kafka. They require Docker or Colima. Run targeted tests with:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.kafka.*'
```
```

- [ ] **Step 5: Run docs checks**

Run:

```bash
git diff --check -- README.md docs/development/architecture.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/development/architecture.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
git commit -m "docs: document kafka notification pipeline"
```

## Task 15: Full Verification

**Files:**
- No source files unless verification exposes defects.

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 3: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. If Kafka is disabled in E2E, notification events may remain pending; member/host pages should still render stable disabled or empty states.

- [ ] **Step 4: Run public release checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS.

- [ ] **Step 5: Commit any verification fixes**

If fixes were required, inspect and stage only the concrete files changed by those fixes:

```bash
git status --short
git add server front README.md docs
git commit -m "fix: stabilize kafka notification pipeline"
```

If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers Kafka dependency/config, event outbox schema, delivery ledger, member notification inbox, Kafka relay, Kafka consumer, email dispatch, host operations UI, docs, and full verification.
- Placeholder scan: The plan does not use TBD/TODO/fill-in placeholders, and every commit step names concrete paths or commands for discovering concrete paths.
- Type consistency: `NotificationEventOutboxStatus`, `NotificationDeliveryStatus`, `NotificationChannel`, `NotificationEventMessage`, `NotificationEventPayload`, and delivery/member models are introduced before later tasks use them.
- Scope control: SMS, Kakao, push, digest, quiet hours, separate consumer service, and JDBC direct delivery fallback remain out of scope.
