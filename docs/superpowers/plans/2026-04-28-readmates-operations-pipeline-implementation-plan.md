# ReadMates Operations Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portfolio-grade operations pipeline that sends session lifecycle emails through OCI Email Delivery, exposes production metrics, and uploads MySQL backups to OCI Object Storage.

**Architecture:** Keep the Spring MVC monolith and feature-local clean architecture. Use MySQL as the durable source of truth with a transactional notification outbox, SMTP as an outbound adapter, Micrometer/Actuator for metrics, and a deploy-side Object Storage backup script. Do not introduce Kafka, WebFlux, or managed Redis in this plan.

**Tech Stack:** Kotlin, Spring Boot 4, Spring MVC, Spring Security, Spring Mail, MySQL/Flyway, Micrometer/Actuator, Prometheus scrape format, OCI Email Delivery SMTP, OCI CLI Object Storage, Vite React host UI.

---

## Scope

This plan has three independently shippable phases:

1. **Email Delivery + MySQL Outbox:** notify members when a next book becomes visible, when a feedback document is uploaded, and when a meeting is due tomorrow.
2. **Observability:** expose metrics for API health, notification backlog, send outcomes, and feedback upload behavior.
3. **OCI Object Storage Backups:** upload compressed MySQL exports and checksum files to a private bucket.

The phases should be implemented in order. Phase 1 creates the product value. Phase 2 makes the pipeline observable. Phase 3 completes the operations story without changing the user-facing app.

## Non-Goals

- Do not add Kafka.
- Do not convert the app to WebFlux.
- Do not send browser push notifications.
- Do not expose Actuator endpoints publicly.
- Do not store private feedback documents in a public bucket.
- Do not add real email addresses, private domains, OCIDs, bucket names, SMTP credentials, or token-shaped examples to tracked files.

## Existing Context

- Server code follows `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence`.
- Host session lifecycle entry points are in `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`.
- Feedback document upload is in `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`.
- Host dashboard API contracts are in `front/features/host/api/host-contracts.ts`.
- Host dashboard UI is in `front/features/host/components/host-dashboard.tsx`.
- Current production docs use OCI Compute, Caddy, Spring Boot JAR, and OCI MySQL HeatWave Always Free.
- `spring-boot-starter-actuator` is already present, but `application.yml` only exposes `health,info`.

## File Structure

### Server Notification Feature

- Create `server/src/main/resources/db/mysql/migration/V16__notification_outbox.sql`
  - Owns notification outbox persistence schema.
- Create `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`
  - Stable event type enum.
- Create `server/src/main/kotlin/com/readmates/notification/domain/NotificationOutboxStatus.kt`
  - Stable delivery status enum.
- Create `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
  - Commands and read models.
- Create `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
  - Host status, event recording, and worker use cases.
- Create `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
  - SQL boundary for enqueue, claim, result update, and dashboard summary.
- Create `server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt`
  - Outbound email boundary.
- Create `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
  - Event-to-email orchestration and retry policy.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
  - MySQL implementation.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
  - Spring Mail implementation.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/LoggingMailDeliveryAdapter.kt`
  - Disabled/local fallback adapter.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxScheduler.kt`
  - Scheduled worker.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
  - Host-only status and manual processing endpoint.
- Modify `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
  - Record `FEEDBACK_DOCUMENT_PUBLISHED` after successful upload insert.
- Modify `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
  - Record `NEXT_BOOK_PUBLISHED` after member/public visibility update.
  - Record `SESSION_REMINDER_DUE` through scheduled reminder scan, not inside request handling.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Add CSRF exception for host notification processing endpoint.

### Server Observability

- Modify `server/build.gradle.kts`
  - Add Spring Mail and Prometheus registry dependencies.
- Modify `server/src/main/resources/application.yml`
  - Add notification, mail, management, and backup-safe defaults.
- Create `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
  - Owns Micrometer counters and gauges for notification pipeline.
- Modify `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
  - Increment feedback upload success/failure counters.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Keep `/actuator/**` authenticated by default.
- Modify `docs/deploy/oci-backend.md`
  - Document local-only Prometheus scrape through SSH tunnel or VM-local Prometheus.

### Frontend Host UI

- Modify `front/features/host/api/host-contracts.ts`
  - Add host notification status DTOs.
- Modify `front/features/host/api/host-api.ts`
  - Add status fetch and manual process call.
- Modify `front/features/host/route/host-dashboard-data.ts`
  - Load notification status with the existing dashboard loader.
- Modify `front/features/host/components/host-dashboard.tsx`
  - Add compact host ledger section for notification backlog and failures.
- Add or modify `front/tests/unit/host-dashboard.test.tsx`
  - Verify notification status rendering.

### OCI Object Storage Backups

- Create `deploy/oci/backup-mysql-to-object-storage.sh`
  - Runs existing export script, writes checksum, uploads both files to OCI Object Storage.
- Modify `docs/deploy/oci-mysql-heatwave.md`
  - Replace example-only object upload with the new script and restore rehearsal checklist.
- Modify `scripts/README.md` only if public release scans need a new safe placeholder rule.

---

## Task 1: Add Notification Outbox Schema

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V16__notification_outbox.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [ ] **Step 1: Write the migration**

Create `V16__notification_outbox.sql`:

```sql
create table notification_outbox (
  id char(36) not null,
  club_id char(36) not null,
  event_type varchar(60) not null,
  aggregate_type varchar(60) not null,
  aggregate_id char(36) not null,
  recipient_membership_id char(36),
  recipient_email varchar(255) not null,
  recipient_display_name varchar(100),
  subject varchar(200) not null,
  body_text text not null,
  deep_link_path varchar(500) not null,
  status varchar(20) not null default 'PENDING',
  attempt_count int not null default 0,
  next_attempt_at datetime(6) not null default (utc_timestamp(6)),
  locked_at datetime(6),
  sent_at datetime(6),
  last_error varchar(500),
  dedupe_key varchar(180) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key notification_outbox_dedupe_key_uk (dedupe_key),
  key notification_outbox_status_next_idx (status, next_attempt_at, created_at),
  key notification_outbox_club_created_idx (club_id, created_at),
  constraint notification_outbox_club_fk foreign key (club_id) references clubs(id),
  constraint notification_outbox_recipient_membership_fk foreign key (recipient_membership_id) references memberships(id),
  constraint notification_outbox_status_check check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD')),
  constraint notification_outbox_attempt_count_check check (attempt_count >= 0),
  constraint notification_outbox_email_check check (length(trim(recipient_email)) > 0),
  constraint notification_outbox_subject_check check (length(trim(subject)) > 0),
  constraint notification_outbox_body_check check (length(trim(body_text)) > 0),
  constraint notification_outbox_deep_link_path_check check (deep_link_path like '/%'),
  constraint notification_outbox_dedupe_key_check check (length(trim(dedupe_key)) > 0)
);
```

- [ ] **Step 2: Run migration test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V16__notification_outbox.sql
git commit -m "feat: add notification outbox schema"
```

---

## Task 2: Add Notification Domain, Ports, and Persistence Adapter

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/domain/NotificationOutboxStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Write failing persistence tests**

Create `JdbcNotificationOutboxAdapterTest.kt` with tests that prove:

```kotlin
@Test
fun `enqueue feedback notification creates one pending row per active attended participant`() {
    adapter.enqueueFeedbackDocumentPublished(
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
    )

    val rows = jdbcTemplate.queryForObject(
        """
        select count(*)
        from notification_outbox
        where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
          and aggregate_id = '00000000-0000-0000-0000-000000000301'
          and status = 'PENDING'
        """.trimIndent(),
        Int::class.java,
    )

    assertThat(rows).isGreaterThan(0)
}

@Test
fun `enqueue is idempotent for the same event and recipient`() {
    val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
    adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)

    val duplicateCount = jdbcTemplate.queryForObject(
        """
        select count(*) - count(distinct dedupe_key)
        from notification_outbox
        where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
          and aggregate_id = ?
        """.trimIndent(),
        Int::class.java,
        sessionId.toString(),
    )

    assertThat(duplicateCount).isZero()
}
```

Use existing testcontainer setup style from `FeedbackDocumentControllerTest.kt`: `@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected: compile failure because notification classes do not exist.

- [ ] **Step 3: Add domain enums**

`NotificationEventType.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationEventType {
    NEXT_BOOK_PUBLISHED,
    SESSION_REMINDER_DUE,
    FEEDBACK_DOCUMENT_PUBLISHED,
}
```

`NotificationOutboxStatus.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationOutboxStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
    DEAD,
}
```

- [ ] **Step 4: Add models and port**

`NotificationModels.kt`:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.time.OffsetDateTime
import java.util.UUID

data class NotificationOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val subject: String,
    val bodyText: String,
    val deepLinkPath: String,
    val status: NotificationOutboxStatus,
    val attemptCount: Int,
)

data class HostNotificationSummary(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sentLast24h: Int,
    val latestFailures: List<HostNotificationFailure>,
)

data class HostNotificationFailure(
    val id: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val attemptCount: Int,
    val lastError: String?,
    val updatedAt: OffsetDateTime,
)
```

`NotificationOutboxPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import java.time.LocalDate
import java.util.UUID

interface NotificationOutboxPort {
    fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueSessionReminderDue(targetDate: LocalDate): Int
    fun claimPending(limit: Int): List<NotificationOutboxItem>
    fun markSent(id: UUID)
    fun markFailed(id: UUID, error: String, nextAttemptDelayMinutes: Long)
    fun markDead(id: UUID, error: String)
    fun hostSummary(clubId: UUID): HostNotificationSummary
}
```

- [ ] **Step 5: Implement JDBC adapter**

Create `JdbcNotificationOutboxAdapter.kt`. Use `insert ignore` with a deterministic `dedupe_key`:

```text
<event_type>:<aggregate_id>:<recipient_membership_id>
```

For `FEEDBACK_DOCUMENT_PUBLISHED`, recipient query:

```sql
select memberships.id, users.email, coalesce(memberships.short_name, users.name) as display_name
from session_participants
join memberships on memberships.id = session_participants.membership_id
  and memberships.club_id = session_participants.club_id
join users on users.id = memberships.user_id
join sessions on sessions.id = session_participants.session_id
  and sessions.club_id = session_participants.club_id
where session_participants.club_id = ?
  and session_participants.session_id = ?
  and session_participants.participation_status = 'ACTIVE'
  and session_participants.attendance_status = 'ATTENDED'
  and memberships.status = 'ACTIVE'
  and sessions.state in ('CLOSED', 'PUBLISHED')
```

For `NEXT_BOOK_PUBLISHED`, recipient query:

```sql
select memberships.id, users.email, coalesce(memberships.short_name, users.name) as display_name
from memberships
join users on users.id = memberships.user_id
join sessions on sessions.club_id = memberships.club_id
where memberships.club_id = ?
  and sessions.id = ?
  and memberships.status = 'ACTIVE'
  and sessions.state = 'DRAFT'
  and sessions.visibility in ('MEMBER', 'PUBLIC')
```

For `SESSION_REMINDER_DUE`, recipient query:

```sql
select memberships.id, users.email, coalesce(memberships.short_name, users.name) as display_name, sessions.id
from sessions
join memberships on memberships.club_id = sessions.club_id
join users on users.id = memberships.user_id
where sessions.session_date = ?
  and sessions.state in ('DRAFT', 'OPEN')
  and sessions.visibility in ('MEMBER', 'PUBLIC')
  and memberships.status = 'ACTIVE'
```

- [ ] **Step 6: Update architecture boundary**

Add `com.readmates.notification.adapter.in.web..` to web adapter packages and `com.readmates.notification.application..` to application packages in `ServerArchitectureBoundaryTest.kt`.

- [ ] **Step 7: Run tests**

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat: add notification outbox persistence"
```

---

## Task 3: Add Mail Adapter and Outbox Worker

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/LoggingMailDeliveryAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationOutboxScheduler.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationOutboxServiceTest.kt`

- [ ] **Step 1: Add dependencies**

Add to `server/build.gradle.kts`:

```kotlin
implementation("org.springframework.boot:spring-boot-starter-mail")
```

- [ ] **Step 2: Add config defaults**

Append to `application.yml`:

```yaml
readmates:
  notifications:
    enabled: ${READMATES_NOTIFICATIONS_ENABLED:false}
    sender-name: ${READMATES_NOTIFICATION_SENDER_NAME:ReadMates}
    sender-email: ${READMATES_NOTIFICATION_SENDER_EMAIL:no-reply@example.com}
    worker:
      enabled: ${READMATES_NOTIFICATION_WORKER_ENABLED:false}
      fixed-delay-ms: ${READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS:30000}
      batch-size: ${READMATES_NOTIFICATION_WORKER_BATCH_SIZE:20}
      max-attempts: ${READMATES_NOTIFICATION_MAX_ATTEMPTS:5}
```

Add SMTP placeholders in Task 7 deploy docs, not to committed runtime defaults.

- [ ] **Step 3: Write service tests**

Create tests for:

```kotlin
@Test
fun `processPending marks sent when mail delivery succeeds`() {
    val port = FakeNotificationOutboxPort(items = listOf(sampleItem()))
    val mail = RecordingMailDeliveryPort()
    val service = NotificationOutboxService(port, mail, maxAttempts = 5)

    service.processPending(limit = 10)

    assertThat(mail.sentSubjects).containsExactly("피드백 문서가 올라왔습니다")
    assertThat(port.sentIds).containsExactly(sampleItem().id)
}

@Test
fun `processPending marks dead after max attempts`() {
    val item = sampleItem(attemptCount = 4)
    val port = FakeNotificationOutboxPort(items = listOf(item))
    val mail = FailingMailDeliveryPort("smtp rejected")
    val service = NotificationOutboxService(port, mail, maxAttempts = 5)

    service.processPending(limit = 10)

    assertThat(port.deadIds).containsExactly(item.id)
    assertThat(port.deadErrors.single()).contains("smtp rejected")
}
```

- [ ] **Step 4: Add use cases and service**

`NotificationUseCases.kt`:

```kotlin
package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.util.UUID

interface RecordNotificationEventUseCase {
    fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID)
    fun recordNextBookPublished(clubId: UUID, sessionId: UUID)
    fun recordSessionReminderDue(targetDate: LocalDate)
}

interface ProcessNotificationOutboxUseCase {
    fun processPending(limit: Int): Int
}

interface GetHostNotificationSummaryUseCase {
    fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary
}
```

`MailDeliveryPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

data class MailDeliveryCommand(
    val to: String,
    val subject: String,
    val text: String,
)

interface MailDeliveryPort {
    fun send(command: MailDeliveryCommand)
}
```

`NotificationOutboxService.kt` must:

- call enqueue methods for record use cases;
- claim pending rows with a limit;
- call `mailDeliveryPort.send`;
- mark sent on success;
- mark failed with delays `5, 15, 60, 240` minutes before max attempts;
- mark dead when `attemptCount + 1 >= maxAttempts`;
- truncate `lastError` to 500 characters before persistence.

- [ ] **Step 5: Add mail adapters**

`SmtpMailDeliveryAdapter`:

```kotlin
@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class SmtpMailDeliveryAdapter(
    private val javaMailSender: JavaMailSender,
    @Value("\${readmates.notifications.sender-email}") private val senderEmail: String,
    @Value("\${readmates.notifications.sender-name}") private val senderName: String,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        val message = SimpleMailMessage()
        message.from = "$senderName <$senderEmail>"
        message.setTo(command.to)
        message.subject = command.subject
        message.text = command.text
        javaMailSender.send(message)
    }
}
```

`LoggingMailDeliveryAdapter` must be active when `readmates.notifications.enabled=false` and log recipient domain only, not full addresses.

- [ ] **Step 6: Add scheduler**

`NotificationOutboxScheduler.kt`:

```kotlin
@Component
@ConditionalOnProperty(prefix = "readmates.notifications.worker", name = ["enabled"], havingValue = "true")
class NotificationOutboxScheduler(
    private val processNotificationOutboxUseCase: ProcessNotificationOutboxUseCase,
    @Value("\${readmates.notifications.worker.batch-size}") private val batchSize: Int,
) {
    @Scheduled(fixedDelayString = "\${readmates.notifications.worker.fixed-delay-ms}")
    fun process() {
        processNotificationOutboxUseCase.processPending(batchSize)
    }
}
```

Enable scheduling with a small config class:

```kotlin
@Configuration
@EnableScheduling
class NotificationSchedulingConfig
```

- [ ] **Step 7: Run tests**

```bash
./server/gradlew -p server test --tests com.readmates.notification.application.service.NotificationOutboxServiceTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification
git commit -m "feat: process notification outbox email delivery"
```

---

## Task 4: Hook Product Events Into the Notification Pipeline

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Test: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [ ] **Step 1: Add failing feedback upload test**

Extend `FeedbackDocumentControllerTest`:

```kotlin
@Test
fun `host feedback upload enqueues attendee notification`() {
    val file = MockMultipartFile(
        "file",
        "feedback-6-test.md",
        "text/markdown",
        validFeedbackDocumentSource().toByteArray(StandardCharsets.UTF_8),
    )

    mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
        file(file)
        with(user("host@example.com"))
    }.andExpect {
        status { isCreated() }
    }

    val count = jdbcTemplate.queryForObject(
        """
        select count(*)
        from notification_outbox
        where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
          and aggregate_id = '00000000-0000-0000-0000-000000000306'
        """.trimIndent(),
        Int::class.java,
    )

    assertThat(count).isGreaterThan(0)
}
```

- [ ] **Step 2: Inject notification event use case into feedback service**

Modify constructor:

```kotlin
class FeedbackDocumentService(
    private val feedbackDocumentStorePort: FeedbackDocumentStorePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
)
```

After `insertDocument`, before response mapping:

```kotlin
recordNotificationEventUseCase.recordFeedbackDocumentPublished(
    clubId = currentMember.clubId,
    sessionId = command.sessionId,
)
```

This runs in the same transaction as document insert. If the request rolls back, the outbox insert rolls back too.

- [ ] **Step 3: Add failing next-book visibility test**

Extend `HostSessionControllerDbTest` with:

```kotlin
@Test
fun `member visible draft session enqueues next book notification`() {
    mockMvc.patch("/api/host/sessions/00000000-0000-0000-0000-000000000307/visibility") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """{"visibility":"MEMBER"}"""
    }.andExpect {
        status { isOk() }
    }

    val count = jdbcTemplate.queryForObject(
        """
        select count(*)
        from notification_outbox
        where event_type = 'NEXT_BOOK_PUBLISHED'
          and aggregate_id = '00000000-0000-0000-0000-000000000307'
        """.trimIndent(),
        Int::class.java,
    )

    assertThat(count).isGreaterThan(0)
}
```

- [ ] **Step 4: Inject notification event use case into host session service**

Modify constructor:

```kotlin
class HostSessionCommandService(
    private val port: HostSessionWritePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
)
```

Update `updateVisibility`:

```kotlin
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
    val detail = port.updateVisibility(command)
    if (detail.state == "DRAFT" && detail.visibility != SessionRecordVisibility.HOST_ONLY) {
        recordNotificationEventUseCase.recordNextBookPublished(command.host.clubId, command.sessionId)
    }
    return detail
}
```

- [ ] **Step 5: Add reminder scheduler entry point**

Add a daily scheduled method in `NotificationOutboxScheduler`:

```kotlin
@Scheduled(cron = "\${readmates.notifications.reminder-cron:0 0 0 * * *}", zone = "\${readmates.notifications.reminder-zone:Asia/Seoul}")
fun enqueueTomorrowReminders() {
    recordNotificationEventUseCase.recordSessionReminderDue(LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(1))
}
```

Inject `RecordNotificationEventUseCase` into the scheduler. Keep the cron disabled in tests by setting `readmates.notifications.worker.enabled=false`.

- [ ] **Step 6: Run focused tests**

```bash
./server/gradlew -p server test --tests com.readmates.feedback.api.FeedbackDocumentControllerTest --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "feat: enqueue session notification events"
```

---

## Task 5: Add Host Notification Status API and Host Dashboard UI

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`

- [ ] **Step 1: Add API controller test**

Create `HostNotificationControllerTest.kt`:

```kotlin
@Test
fun `host can read notification status summary`() {
    jdbcTemplate.update(
        """
        insert into notification_outbox (
          id, club_id, event_type, aggregate_type, aggregate_id,
          recipient_email, subject, body_text, deep_link_path, status, dedupe_key
        ) values (
          '00000000-0000-0000-0000-000000009001',
          '00000000-0000-0000-0000-000000000001',
          'FEEDBACK_DOCUMENT_PUBLISHED',
          'SESSION',
          '00000000-0000-0000-0000-000000000301',
          'member@example.com',
          '피드백 문서가 올라왔습니다',
          'ReadMates에서 확인해 주세요.',
          '/app/feedback/00000000-0000-0000-0000-000000000301',
          'FAILED',
          'test-summary-failed'
        )
        """.trimIndent(),
    )

    mockMvc.get("/api/host/notifications/summary") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.failed") { value(1) }
        jsonPath("$.latestFailures[0].eventType") { value("FEEDBACK_DOCUMENT_PUBLISHED") }
    }
}
```

- [ ] **Step 2: Add controller**

`HostNotificationController.kt`:

```kotlin
@RestController
@RequestMapping("/api/host/notifications")
class HostNotificationController(
    private val getHostNotificationSummaryUseCase: GetHostNotificationSummaryUseCase,
    private val processNotificationOutboxUseCase: ProcessNotificationOutboxUseCase,
) {
    @GetMapping("/summary")
    fun summary(host: CurrentMember) =
        getHostNotificationSummaryUseCase.getHostNotificationSummary(host)

    @PostMapping("/process")
    fun process(host: CurrentMember): Map<String, Int> {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return mapOf("processed" to processNotificationOutboxUseCase.processPending(20))
    }
}
```

- [ ] **Step 3: Update security**

Add CSRF ignore matcher:

```kotlin
methodAndPath("POST", Regex("^/api/host/notifications/process$"))
```

No new `authorizeHttpRequests` rule is needed because `/api/host/**` already requires host role.

- [ ] **Step 4: Add frontend contracts**

In `host-contracts.ts`:

```ts
export type HostNotificationSummary = {
  pending: number;
  failed: number;
  dead: number;
  sentLast24h: number;
  latestFailures: Array<{
    id: string;
    eventType: "NEXT_BOOK_PUBLISHED" | "SESSION_REMINDER_DUE" | "FEEDBACK_DOCUMENT_PUBLISHED";
    recipientEmail: string;
    attemptCount: number;
    lastError: string | null;
    updatedAt: string;
  }>;
};
```

In `host-api.ts`:

```ts
export function fetchHostNotificationSummary() {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary");
}

export function processHostNotifications() {
  return readmatesFetchResponse("/api/host/notifications/process", { method: "POST" });
}
```

- [ ] **Step 5: Load status in dashboard route**

Modify `HostDashboardRouteData`:

```ts
export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListItem[];
  notifications: HostNotificationSummary;
};
```

Add `fetchHostNotificationSummary()` to the existing `Promise.all`.

- [ ] **Step 6: Render compact host ledger section**

Add to dashboard props:

```ts
notifications: HostNotificationSummary;
```

Render a section near `공개 · 피드백`:

```tsx
<section className="host-ledger-section" aria-labelledby="host-notifications-title">
  <div className="section-heading-row">
    <h2 id="host-notifications-title">알림 발송</h2>
    <span className="host-subtle-count">최근 24시간 {notifications.sentLast24h}건</span>
  </div>
  <div className="host-metric-row">
    <span>대기 {notifications.pending}</span>
    <span>실패 {notifications.failed}</span>
    <span>중단 {notifications.dead}</span>
  </div>
  {notifications.latestFailures.length > 0 ? (
    <ul className="host-alert-list">
      {notifications.latestFailures.slice(0, 3).map((failure) => (
        <li key={failure.id}>
          <strong>{failure.eventType}</strong>
          <span>{failure.attemptCount}회 시도</span>
        </li>
      ))}
    </ul>
  ) : null}
</section>
```

Use existing CSS classes where possible. Do not expose full email addresses in UI if the current host dashboard does not already show them in that context. Mask as `m***@example.com` in the server DTO or frontend model before rendering.

- [ ] **Step 7: Run checks**

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.HostNotificationControllerTest
pnpm --dir front test -- host-dashboard
pnpm --dir front lint
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/in/web server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt server/src/test/kotlin/com/readmates/notification/api front/features/host front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: show host notification status"
```

---

## Task 6: Add Notification and Feedback Metrics

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetricsTest.kt`
- Test: `server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt`

- [ ] **Step 1: Add Prometheus registry**

Add:

```kotlin
runtimeOnly("io.micrometer:micrometer-registry-prometheus")
```

- [ ] **Step 2: Configure management endpoints**

Change management exposure:

```yaml
management:
  server:
    address: ${READMATES_MANAGEMENT_ADDRESS:127.0.0.1}
    port: ${READMATES_MANAGEMENT_PORT:8081}
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
  endpoint:
    health:
      probes:
        enabled: true
  metrics:
    tags:
      application: ${spring.application.name}
```

Keep `/actuator/**` off the public Caddy route. `HealthControllerTest` must continue to assert the main application port does not expose `/actuator/health` anonymously.

- [ ] **Step 3: Add metrics service**

`ReadmatesOperationalMetrics.kt`:

```kotlin
@Service
class ReadmatesOperationalMetrics(private val meterRegistry: MeterRegistry) {
    fun sent(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.sent")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    fun failed(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.failed")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    fun dead(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.dead")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    fun feedbackUploadSucceeded() {
        meterRegistry.counter("readmates.feedback.uploads", "result", "success").increment()
    }

    fun feedbackUploadFailed() {
        meterRegistry.counter("readmates.feedback.uploads", "result", "failure").increment()
    }
}
```

- [ ] **Step 4: Wire metrics**

In `NotificationOutboxService`, call:

- `metrics.sent(item.eventType)` after `markSent`.
- `metrics.failed(item.eventType)` after `markFailed`.
- `metrics.dead(item.eventType)` after `markDead`.

In `FeedbackDocumentService.uploadHostFeedbackDocument`, wrap parsing and insert:

```kotlin
return runCatching {
    // existing upload code
}.onSuccess {
    operationalMetrics.feedbackUploadSucceeded()
}.onFailure {
    operationalMetrics.feedbackUploadFailed()
}.getOrThrow()
```

Inject `ReadmatesOperationalMetrics` into both notification and feedback services. Do not create a second metrics helper class.

- [ ] **Step 5: Add metric tests**

Assert counters increment using `SimpleMeterRegistry`:

```kotlin
@Test
fun `sent metric increments with event type tag`() {
    val registry = SimpleMeterRegistry()
    val metrics = ReadmatesOperationalMetrics(registry)

    metrics.sent(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)

    assertThat(registry.counter(
        "readmates.notifications.sent",
        "event_type",
        "FEEDBACK_DOCUMENT_PUBLISHED",
    ).count()).isEqualTo(1.0)
}
```

- [ ] **Step 6: Run checks**

```bash
./server/gradlew -p server test --tests com.readmates.notification.application.service.ReadmatesOperationalMetricsTest --tests com.readmates.shared.adapter.in.web.HealthControllerTest
```

Expected:

- metric unit test passes;
- `/internal/health` remains public;
- `/actuator/health` remains unauthorized.

- [ ] **Step 7: Commit**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml server/src/main/kotlin/com/readmates/notification/application/service server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt server/src/test/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt
git commit -m "feat: add operations metrics"
```

---

## Task 7: Document OCI Email Delivery and Metrics Deployment

**Files:**
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Add production env placeholders**

Add this block to `docs/deploy/oci-backend.md`:

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_NOTIFICATION_WORKER_ENABLED=true
READMATES_NOTIFICATION_SENDER_NAME=ReadMates
READMATES_NOTIFICATION_SENDER_EMAIL=no-reply@example.com
SPRING_MAIL_HOST=smtp.email.<oci-region>.oraclecloud.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<oci-smtp-username>
SPRING_MAIL_PASSWORD=<oci-smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT=5000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_TIMEOUT=3000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_WRITETIMEOUT=5000
```

Use `<oci-region>` and placeholders only. Do not use the real region, sender domain, SMTP username, or SMTP password.

- [ ] **Step 2: Add local metrics verification**

Document VM-local check:

```bash
curl -sS http://127.0.0.1:8081/actuator/prometheus | grep readmates_notifications
```

Document that `READMATES_MANAGEMENT_ADDRESS=127.0.0.1` and `READMATES_MANAGEMENT_PORT=8081` are required for VM-local scraping. Do not suggest exposing `/actuator/prometheus` through Caddy.

- [ ] **Step 3: Add test guide section**

Add targeted commands:

```bash
./server/gradlew -p server test --tests com.readmates.notification
./server/gradlew -p server clean test
pnpm --dir front test -- host-dashboard
pnpm --dir front lint
```

- [ ] **Step 4: Run docs check**

```bash
git diff --check -- docs/deploy/oci-backend.md docs/development/test-guide.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy/oci-backend.md docs/development/test-guide.md
git commit -m "docs: document notification operations deployment"
```

---

## Task 8: Add OCI Object Storage Backup Upload Script

**Files:**
- Create: `deploy/oci/backup-mysql-to-object-storage.sh`
- Modify: `docs/deploy/oci-mysql-heatwave.md`

- [ ] **Step 1: Write backup script**

Create `deploy/oci/backup-mysql-to-object-storage.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${READMATES_EXPORT_BUCKET:?READMATES_EXPORT_BUCKET is required}"
: "${OCI_NAMESPACE:?OCI_NAMESPACE is required}"
: "${READMATES_DB_HOST:?READMATES_DB_HOST is required}"
: "${READMATES_DB_NAME:=readmates}"
: "${READMATES_DB_USER:=readmates}"
: "${READMATES_EXPORT_DIR:=/var/backups/readmates/mysql}"
: "${READMATES_MYSQL_DEFAULTS_FILE:=/etc/readmates/mysql-backup.cnf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export_path="$(
  READMATES_DB_HOST="$READMATES_DB_HOST" \
  READMATES_DB_NAME="$READMATES_DB_NAME" \
  READMATES_DB_USER="$READMATES_DB_USER" \
  READMATES_EXPORT_DIR="$READMATES_EXPORT_DIR" \
  READMATES_MYSQL_DEFAULTS_FILE="$READMATES_MYSQL_DEFAULTS_FILE" \
  "$SCRIPT_DIR/export-mysql.sh"
)"

checksum_path="${export_path}.sha256"
sha256sum "$export_path" > "$checksum_path"

object_prefix="${READMATES_BACKUP_OBJECT_PREFIX:-mysql}"
backup_name="$(basename "$export_path")"
checksum_name="$(basename "$checksum_path")"

oci os object put \
  --namespace-name "$OCI_NAMESPACE" \
  --bucket-name "$READMATES_EXPORT_BUCKET" \
  --name "$object_prefix/$backup_name" \
  --file "$export_path" \
  --force

oci os object put \
  --namespace-name "$OCI_NAMESPACE" \
  --bucket-name "$READMATES_EXPORT_BUCKET" \
  --name "$object_prefix/$checksum_name" \
  --file "$checksum_path" \
  --force

echo "UPLOADED: $object_prefix/$backup_name"
echo "UPLOADED: $object_prefix/$checksum_name"
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x deploy/oci/backup-mysql-to-object-storage.sh
```

- [ ] **Step 3: Add docs**

In `docs/deploy/oci-mysql-heatwave.md`, document:

- private bucket only;
- bucket name placeholder `readmates-db-exports`;
- required env vars;
- checksum verification:

```bash
sha256sum -c readmates-YYYYMMDDTHHMMSSZ.sql.gz.sha256
```

- restore rehearsal command using a non-production DB.

- [ ] **Step 4: Run shell syntax and docs checks**

```bash
bash -n deploy/oci/backup-mysql-to-object-storage.sh
git diff --check -- deploy/oci/backup-mysql-to-object-storage.sh docs/deploy/oci-mysql-heatwave.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add deploy/oci/backup-mysql-to-object-storage.sh docs/deploy/oci-mysql-heatwave.md
git commit -m "feat: upload mysql backups to object storage"
```

---

## Task 9: Full Verification and Portfolio Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/deploy/security-public-repo.md` only if scanner behavior changes.

- [ ] **Step 1: Add concise README highlight**

Add one bullet under highlights:

```markdown
- 운영 파이프라인: MySQL transactional outbox 기반 이메일 알림, Micrometer/Prometheus 운영 지표, OCI Object Storage 백업 업로드를 지원합니다.
```

- [ ] **Step 2: Add architecture note**

In `docs/development/architecture.md`, document:

```text
notification
  adapter.in.web / adapter.in.scheduler
  application.service
  application.port.out
  adapter.out.persistence / adapter.out.mail
```

State that MySQL remains the source of truth and email delivery is retryable side effect work.

- [ ] **Step 3: Run full checks**

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check -- README.md docs/development/architecture.md docs/deploy/oci-backend.md docs/deploy/oci-mysql-heatwave.md
```

Expected: all pass.

- [ ] **Step 4: Run public release checks if docs mention deployment or public safety changes**

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: no new public-safety findings caused by the changed files.

- [ ] **Step 5: Final commit**

```bash
git add README.md docs/development/architecture.md
git commit -m "docs: describe operations pipeline"
```

---

## Rollout Plan

1. Deploy with notifications disabled:

```bash
READMATES_NOTIFICATIONS_ENABLED=false
READMATES_NOTIFICATION_WORKER_ENABLED=false
```

2. Run migration and verify app health:

```bash
curl -sS http://127.0.0.1:8080/internal/health
```

3. Keep mail delivery and the worker disabled while validating outbox writes:

```bash
READMATES_NOTIFICATIONS_ENABLED=false
READMATES_NOTIFICATION_WORKER_ENABLED=false
```

4. Confirm host actions create outbox rows and dashboard counts.

5. Configure OCI Email Delivery SMTP credentials in `/etc/readmates/readmates.env`.

6. Enable actual email delivery:

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_NOTIFICATION_WORKER_ENABLED=true
```

7. Watch metrics and logs:

```bash
sudo journalctl -u readmates-server -n 120 --no-pager
curl -sS http://127.0.0.1:8080/actuator/prometheus | grep readmates_notifications
```

8. Enable Object Storage backup script from a manual command before adding a timer.

## Failure Modes

- SMTP credentials invalid: outbox rows move to `FAILED`, then `DEAD`; host dashboard shows failures.
- Email provider slow: SMTP timeout caps blocked worker thread time.
- App restart during send: claimed rows stuck in `SENDING`; add a query in `claimPending` that returns `SENDING` rows older than 15 minutes back to `PENDING`.
- Duplicate event hook: `dedupe_key` prevents duplicate rows per recipient/event/session.
- Object Storage upload fails: local gzip export remains in `/var/backups/readmates/mysql`.
- Actuator accidentally exposed through Caddy: rollback Caddy route and verify `/actuator/health` is not public.

## Success Criteria

- Feedback document upload creates one pending email notification per active attended member.
- Making a draft session member-visible creates one next-book notification per active member.
- Daily reminder enqueue creates one reminder notification per active member for tomorrow's member-visible session.
- Worker sends successful notifications and records failed/dead outcomes.
- Host dashboard shows pending, failed, dead, and sent-last-24h counts.
- `/actuator/prometheus` includes `readmates_notifications_sent`, `readmates_notifications_failed`, and feedback upload counters.
- MySQL backup script uploads `.sql.gz` and `.sha256` objects to a private bucket.
- Full server, frontend, docs, and public-safety checks pass before shipping.
