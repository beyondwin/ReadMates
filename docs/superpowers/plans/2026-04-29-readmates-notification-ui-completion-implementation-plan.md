# ReadMates Notification UI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete ReadMates email notification settings and host notification operations UI, including preference-aware delivery, dead-letter recovery, test mail audit, and the new review-published notification.

**Architecture:** Extend the existing `notification` clean-architecture slice instead of introducing a new subsystem. Keep `notification_outbox` as the delivery source of truth, add preference and test-mail audit tables, and route UI changes through feature-owned API/route/ui modules.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate, Flyway MySQL migrations, MockMvc, JUnit, React/Vite, React Router 7, Vitest/Testing Library, TypeScript.

---

## Scope Check

This is one coherent notification-completion feature, but it touches server persistence, notification application services, current/archive review writing, host operations, and member settings UI. Keep each task independently testable and commit after each task. Do not start frontend work until the backend contracts it depends on have passing tests.

Important existing-code gap: current long-review save uses `/api/sessions/current/reviews`, targets only `OPEN` sessions, and writes `long_reviews.visibility = 'PRIVATE'`. The `REVIEW_PUBLISHED` event cannot fire from current code. This plan resolves that by adding a session-scoped member archive review save endpoint for already published visible sessions before wiring the notification trigger.

## File Map

Server migrations:

- Create `server/src/main/resources/db/mysql/migration/V17__notification_preferences_and_test_mail_audit.sql`: notification preference table, test-mail audit table, and supporting indexes.

Server notification domain/application:

- Modify `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`: add `REVIEW_PUBLISHED`.
- Modify `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`: add preference, host item, detail, retry/restore, and test-mail audit models.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`: add use cases for preferences, host item operations, test mail, and review event recording.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`: add persistence operations for preferences, item list/detail, retry/restore, review enqueue, and test-mail audit.
- Modify `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`: implement new use cases and reuse existing delivery logic for single-item retry.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`: implement SQL for preferences, filtered enqueue, item list/detail, restore, review enqueue, and audit.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`: extend host endpoints.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt`: member preference endpoints.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`: request/response DTOs and mapping helpers.

Server review trigger:

- Modify `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt`: include published-review metadata for long-review saves.
- Modify `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`: inject notification recorder and record review-published events.
- Modify `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`: return enriched long-review result.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt`: keep current review behavior unchanged.
- Create `server/src/main/kotlin/com/readmates/archive/adapter/in/web/MemberArchiveReviewController.kt`, `server/src/main/kotlin/com/readmates/archive/application/port/in/MemberArchiveReviewUseCases.kt`, `server/src/main/kotlin/com/readmates/archive/application/service/MemberArchiveReviewService.kt`, and `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcMemberArchiveReviewWriteAdapter.kt` for the published-session review save path because it belongs to archive, not current-session writing.

Frontend host:

- Modify `front/features/host/api/host-contracts.ts`: host notification item/detail/audit/request types.
- Modify `front/features/host/api/host-api.ts`: host notification item/retry/restore/test-mail API calls.
- Create `front/features/host/route/host-notifications-data.ts`: loader/actions for `/app/host/notifications`.
- Create `front/features/host/route/host-notifications-route.tsx`: route shell.
- Create `front/features/host/ui/host-notifications-page.tsx`: host notification operations UI.
- Modify `front/features/host/components/host-dashboard.tsx`: add link to `/app/host/notifications`.
- Modify `front/features/host/index.ts`, `front/src/app/host-route-elements.tsx`, and `front/src/app/router.tsx`: export and register the route.

Frontend member:

- Modify `front/features/archive/api/archive-contracts.ts`: notification preference types.
- Modify `front/features/archive/api/archive-api.ts`: preference fetch/save calls.
- Modify `front/features/archive/route/my-page-data.ts`: load preferences.
- Modify `front/features/archive/route/my-page-route.tsx`: pass preferences and save callback.
- Modify `front/features/archive/ui/my-page.tsx`: replace read-only notification rows with working controls.
- Modify `front/features/archive/model/archive-model.ts`: labels, defaults, dirty-state helpers.

Tests:

- Modify `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`.
- Create `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationPreferenceControllerTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/notification/application/service/NotificationOutboxServiceTest.kt`.
- Add archive review API tests under `server/src/test/kotlin/com/readmates/archive/api/`.
- Modify `front/tests/unit/my-page.test.tsx`.
- Modify `front/tests/unit/host-dashboard.test.tsx`.
- Create `front/tests/unit/host-notifications.test.tsx`.

---

### Task 1: Add Notification Preference And Test-Mail Audit Schema

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V17__notification_preferences_and_test_mail_audit.sql`
- Modify: `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the migration**

Create `server/src/main/resources/db/mysql/migration/V17__notification_preferences_and_test_mail_audit.sql`:

```sql
create table notification_preferences (
  membership_id char(36) not null,
  club_id char(36) not null,
  email_enabled boolean not null default true,
  next_book_published_enabled boolean not null default true,
  session_reminder_due_enabled boolean not null default true,
  feedback_document_published_enabled boolean not null default true,
  review_published_enabled boolean not null default false,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (membership_id, club_id),
  constraint notification_preferences_membership_fk
    foreign key (membership_id, club_id) references memberships(id, club_id)
);

create table notification_test_mail_audit (
  id char(36) not null,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  recipient_masked_email varchar(320) not null,
  recipient_email_hash char(64) not null,
  status varchar(20) not null,
  last_error varchar(500),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  key notification_test_mail_audit_club_created_idx (club_id, created_at),
  key notification_test_mail_audit_host_created_idx (host_membership_id, club_id, created_at),
  key notification_test_mail_audit_recipient_hash_idx (recipient_email_hash, created_at),
  constraint notification_test_mail_audit_club_fk foreign key (club_id) references clubs(id),
  constraint notification_test_mail_audit_host_membership_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint notification_test_mail_audit_status_check check (status in ('SENT', 'FAILED')),
  constraint notification_test_mail_audit_mask_check check (length(trim(recipient_masked_email)) > 0),
  constraint notification_test_mail_audit_hash_check check (recipient_email_hash regexp '^[0-9a-f]{64}$')
);
```

- [x] **Step 2: Add the new event enum**

Modify `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`:

```kotlin
package com.readmates.notification.domain

enum class NotificationEventType {
    NEXT_BOOK_PUBLISHED,
    SESSION_REMINDER_DUE,
    FEEDBACK_DOCUMENT_PUBLISHED,
    REVIEW_PUBLISHED,
}
```

- [x] **Step 3: Run migration tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 4: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V17__notification_preferences_and_test_mail_audit.sql \
  server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt
git commit -m "feat: add notification preference schema"
```

---

### Task 2: Add Member Notification Preference Backend

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationPreferenceControllerTest.kt`

- [x] **Step 1: Write controller tests**

Create `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationPreferenceControllerTest.kt`:

```kotlin
package com.readmates.notification.api

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put

private const val CLEANUP_PREFERENCES_SQL = """
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_PREFERENCES_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_PREFERENCES_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class MemberNotificationPreferenceControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `member reads default notification preferences`() {
        mockMvc.get("/api/me/notifications/preferences") {
            with(user("member1@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.emailEnabled") { value(true) }
            jsonPath("$.events.NEXT_BOOK_PUBLISHED") { value(true) }
            jsonPath("$.events.SESSION_REMINDER_DUE") { value(true) }
            jsonPath("$.events.FEEDBACK_DOCUMENT_PUBLISHED") { value(true) }
            jsonPath("$.events.REVIEW_PUBLISHED") { value(false) }
        }
    }

    @Test
    fun `member saves notification preferences`() {
        mockMvc.put("/api/me/notifications/preferences") {
            with(user("member1@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "emailEnabled": false,
                  "events": {
                    "NEXT_BOOK_PUBLISHED": true,
                    "SESSION_REMINDER_DUE": false,
                    "FEEDBACK_DOCUMENT_PUBLISHED": true,
                    "REVIEW_PUBLISHED": true
                  }
                }
            """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.emailEnabled") { value(false) }
            jsonPath("$.events.SESSION_REMINDER_DUE") { value(false) }
            jsonPath("$.events.REVIEW_PUBLISHED") { value(true) }
        }

        val row = jdbcTemplate.queryForMap(
            """
            select email_enabled, session_reminder_due_enabled, review_published_enabled
            from notification_preferences
            join memberships on memberships.id = notification_preferences.membership_id
            join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
            """.trimIndent(),
        )
        assertThat(row["email_enabled"]).isEqualTo(false)
        assertThat(row["session_reminder_due_enabled"]).isEqualTo(false)
        assertThat(row["review_published_enabled"]).isEqualTo(true)
    }

    @Test
    fun `unauthenticated member preferences request is rejected`() {
        mockMvc.get("/api/me/notifications/preferences").andExpect {
            status { isUnauthorized() }
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run the new tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.MemberNotificationPreferenceControllerTest
```

Expected: FAIL with no route for `/api/me/notifications/preferences` or missing model classes.

- [x] **Step 3: Add preference models and ports**

Append to `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`:

```kotlin
data class NotificationPreferences(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
) {
    fun enabled(eventType: NotificationEventType): Boolean =
        emailEnabled && (events[eventType] ?: defaultEventEnabled(eventType))

    companion object {
        fun defaults() = NotificationPreferences(
            emailEnabled = true,
            events = mapOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED to true,
                NotificationEventType.SESSION_REMINDER_DUE to true,
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to true,
                NotificationEventType.REVIEW_PUBLISHED to false,
            ),
        )

        fun defaultEventEnabled(eventType: NotificationEventType): Boolean =
            defaults().events.getValue(eventType)
    }
}
```

Append to `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`:

```kotlin
interface ManageNotificationPreferencesUseCase {
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
}
```

Append to `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`:

```kotlin
fun getPreferences(member: CurrentMember): NotificationPreferences
fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
```

Add the required imports:

```kotlin
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.shared.security.CurrentMember
```

- [x] **Step 4: Implement service methods**

Modify the class declaration in `NotificationOutboxService.kt`:

```kotlin
) : RecordNotificationEventUseCase,
    ProcessNotificationOutboxUseCase,
    GetHostNotificationSummaryUseCase,
    ManageNotificationPreferencesUseCase {
```

Add methods:

```kotlin
override fun getPreferences(member: CurrentMember): NotificationPreferences =
    notificationOutboxPort.getPreferences(member)

override fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences =
    notificationOutboxPort.savePreferences(member, preferences)
```

- [x] **Step 5: Implement DTOs and controller**

Create `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`:

```kotlin
package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.domain.NotificationEventType

data class NotificationPreferencesRequest(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
) {
    fun toModel(): NotificationPreferences =
        NotificationPreferences(
            emailEnabled = emailEnabled,
            events = NotificationEventType.entries.associateWith { event ->
                events[event] ?: NotificationPreferences.defaultEventEnabled(event)
            },
        )
}

data class NotificationPreferencesResponse(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
)

fun NotificationPreferences.toResponse() =
    NotificationPreferencesResponse(
        emailEnabled = emailEnabled,
        events = NotificationEventType.entries.associateWith { event ->
            events[event] ?: NotificationPreferences.defaultEventEnabled(event)
        },
    )
```

Create `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt`:

```kotlin
package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/me/notifications/preferences")
class MemberNotificationController(
    private val manageNotificationPreferencesUseCase: ManageNotificationPreferencesUseCase,
) {
    @GetMapping
    fun get(member: CurrentMember): NotificationPreferencesResponse =
        manageNotificationPreferencesUseCase.getPreferences(member).toResponse()

    @PutMapping
    fun save(
        member: CurrentMember,
        @RequestBody request: NotificationPreferencesRequest,
    ): NotificationPreferencesResponse =
        manageNotificationPreferencesUseCase.savePreferences(member, request.toModel()).toResponse()
}
```

- [x] **Step 6: Implement JDBC preference persistence**

Add methods to `JdbcNotificationOutboxAdapter.kt`:

```kotlin
override fun getPreferences(member: CurrentMember): NotificationPreferences {
    val row = jdbcTemplate().query(
        """
        select email_enabled,
               next_book_published_enabled,
               session_reminder_due_enabled,
               feedback_document_published_enabled,
               review_published_enabled
        from notification_preferences
        where membership_id = ?
          and club_id = ?
        """.trimIndent(),
        { rs, _ ->
            NotificationPreferences(
                emailEnabled = rs.getBoolean("email_enabled"),
                events = mapOf(
                    NotificationEventType.NEXT_BOOK_PUBLISHED to rs.getBoolean("next_book_published_enabled"),
                    NotificationEventType.SESSION_REMINDER_DUE to rs.getBoolean("session_reminder_due_enabled"),
                    NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to rs.getBoolean("feedback_document_published_enabled"),
                    NotificationEventType.REVIEW_PUBLISHED to rs.getBoolean("review_published_enabled"),
                ),
            )
        },
        member.membershipId.dbString(),
        member.clubId.dbString(),
    ).firstOrNull()

    return row ?: NotificationPreferences.defaults()
}

override fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences {
    jdbcTemplate().update(
        """
        insert into notification_preferences (
          membership_id,
          club_id,
          email_enabled,
          next_book_published_enabled,
          session_reminder_due_enabled,
          feedback_document_published_enabled,
          review_published_enabled
        ) values (?, ?, ?, ?, ?, ?, ?)
        on duplicate key update
          email_enabled = values(email_enabled),
          next_book_published_enabled = values(next_book_published_enabled),
          session_reminder_due_enabled = values(session_reminder_due_enabled),
          feedback_document_published_enabled = values(feedback_document_published_enabled),
          review_published_enabled = values(review_published_enabled),
          updated_at = utc_timestamp(6)
        """.trimIndent(),
        member.membershipId.dbString(),
        member.clubId.dbString(),
        preferences.emailEnabled,
        preferences.events[NotificationEventType.NEXT_BOOK_PUBLISHED] ?: true,
        preferences.events[NotificationEventType.SESSION_REMINDER_DUE] ?: true,
        preferences.events[NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED] ?: true,
        preferences.events[NotificationEventType.REVIEW_PUBLISHED] ?: false,
    )
    return getPreferences(member)
}
```

Add imports:

```kotlin
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.shared.security.CurrentMember
```

- [x] **Step 7: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.MemberNotificationPreferenceControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification/api/MemberNotificationPreferenceControllerTest.kt
git commit -m "feat: add member notification preferences"
```

---

### Task 3: Apply Preferences To Existing Enqueue Paths

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`

- [x] **Step 1: Add failing tests for disabled preferences**

Append tests to `JdbcNotificationOutboxAdapterTest.kt`:

```kotlin
@Test
fun `enqueue next book skips member with disabled event preference`() {
    val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000302")
    disableMemberPreference("member1@example.com", "next_book_published_enabled")

    adapter.enqueueNextBookPublished(clubId, sessionId)

    val member1Rows = notificationRowsFor("NEXT_BOOK_PUBLISHED", "member1@example.com")
    assertThat(member1Rows).isZero()
}

@Test
fun `enqueue feedback skips member with global email disabled`() {
    disableMemberEmail("member1@example.com")

    adapter.enqueueFeedbackDocumentPublished(
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
    )

    val member1Rows = notificationRowsFor("FEEDBACK_DOCUMENT_PUBLISHED", "member1@example.com")
    assertThat(member1Rows).isZero()
}
```

Add helpers in the same test class:

```kotlin
private fun disableMemberEmail(email: String) {
    upsertPreference(email, "email_enabled = false")
}

private fun disableMemberPreference(email: String, column: String) {
    upsertPreference(email, "$column = false")
}

private fun upsertPreference(email: String, assignment: String) {
    val membership = jdbcTemplate.queryForMap(
        """
        select memberships.id as membership_id, memberships.club_id as club_id
        from memberships
        join users on users.id = memberships.user_id
        where users.email = ?
        """.trimIndent(),
        email,
    )
    jdbcTemplate.update(
        """
        insert into notification_preferences (membership_id, club_id)
        values (?, ?)
        on duplicate key update updated_at = utc_timestamp(6)
        """.trimIndent(),
        membership["membership_id"].toString(),
        membership["club_id"].toString(),
    )
    jdbcTemplate.update(
        """
        update notification_preferences
        set $assignment
        where membership_id = ?
          and club_id = ?
        """.trimIndent(),
        membership["membership_id"].toString(),
        membership["club_id"].toString(),
    )
}

private fun notificationRowsFor(eventType: String, email: String): Int =
    jdbcTemplate.queryForObject(
        """
        select count(*)
        from notification_outbox
        where event_type = ?
          and recipient_email = ?
        """.trimIndent(),
        Int::class.java,
        eventType,
        email,
    ) ?: 0
```

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected: FAIL because enqueue SQL does not filter by `notification_preferences`.

- [x] **Step 3: Add preference predicates to recipient queries**

In each recipient query in `JdbcNotificationOutboxAdapter.kt`, add a left join:

```sql
left join notification_preferences on notification_preferences.membership_id = memberships.id
  and notification_preferences.club_id = memberships.club_id
```

For `enqueueFeedbackDocumentPublished`, add:

```sql
and coalesce(notification_preferences.email_enabled, true)
and coalesce(notification_preferences.feedback_document_published_enabled, true)
```

For `enqueueNextBookPublished`, add:

```sql
and coalesce(notification_preferences.email_enabled, true)
and coalesce(notification_preferences.next_book_published_enabled, true)
```

For `enqueueSessionReminderDue`, add:

```sql
and coalesce(notification_preferences.email_enabled, true)
and coalesce(notification_preferences.session_reminder_due_enabled, true)
```

- [x] **Step 4: Run adapter tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt \
  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt
git commit -m "feat: respect notification preferences in delivery"
```

---

### Task 4: Add Host Notification List, Detail, Retry, And Restore Backend

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationOutboxServiceTest.kt`

- [x] **Step 1: Add host API tests**

Append to `HostNotificationControllerTest.kt`:

```kotlin
@Test
fun `host can list notification outbox items with masked recipients`() {
    insertPendingNotification(
        id = "00000000-0000-0000-0000-000000009401",
        clubId = "00000000-0000-0000-0000-000000000001",
        dedupeKey = "host-notification-controller-test-list",
    )

    mockMvc.get("/api/host/notifications/items?status=PENDING") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.items[0].id") { value("00000000-0000-0000-0000-000000009401") }
        jsonPath("$.items[0].recipientEmail") { value("m***@example.com") }
        jsonPath("$.items[0].eventType") { value("FEEDBACK_DOCUMENT_PUBLISHED") }
        jsonPath("$.items[0].status") { value("PENDING") }
        jsonPath("$.items[0].subject") { doesNotExist() }
    }
}

@Test
fun `host can read notification detail without body text or raw email`() {
    insertPendingNotification(
        id = "00000000-0000-0000-0000-000000009402",
        clubId = "00000000-0000-0000-0000-000000000001",
        dedupeKey = "host-notification-controller-test-detail",
    )

    val response = mockMvc.get("/api/host/notifications/items/00000000-0000-0000-0000-000000009402") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.recipientEmail") { value("m***@example.com") }
        jsonPath("$.subject") { value("피드백 문서가 올라왔습니다") }
        jsonPath("$.bodyText") { doesNotExist() }
    }.andReturn().response.contentAsString

    assertThat(response).doesNotContain("member@example.com")
    assertThat(response).doesNotContain("ReadMates에서 확인해 주세요.")
}

@Test
fun `host restores dead notification`() {
    insertNotification(
        id = "00000000-0000-0000-0000-000000009403",
        clubId = "00000000-0000-0000-0000-000000000001",
        status = com.readmates.notification.domain.NotificationOutboxStatus.DEAD,
        dedupeKey = "host-notification-controller-test-restore",
    )

    mockMvc.post("/api/host/notifications/items/00000000-0000-0000-0000-000000009403/restore") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("PENDING") }
    }
}
```

Move `insertNotification` helper from `JdbcNotificationOutboxAdapterTest.kt` style into `HostNotificationControllerTest.kt` so it can insert different statuses.

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.HostNotificationControllerTest
```

Expected: FAIL because item, detail, and restore endpoints do not exist.

- [x] **Step 3: Add models**

Append to `NotificationModels.kt`:

```kotlin
data class HostNotificationItemQuery(
    val status: NotificationOutboxStatus?,
    val eventType: NotificationEventType?,
    val limit: Int,
)

data class HostNotificationItem(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val attemptCount: Int,
    val nextAttemptAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostNotificationItemList(
    val items: List<HostNotificationItem>,
)

data class HostNotificationDetail(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val subject: String,
    val deepLinkPath: String,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)
```

- [x] **Step 4: Add ports and service operations**

Add to `NotificationUseCases.kt`:

```kotlin
interface ManageHostNotificationsUseCase {
    fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList
    fun detail(host: CurrentMember, id: UUID): HostNotificationDetail
    fun retry(host: CurrentMember, id: UUID): HostNotificationDetail
    fun restore(host: CurrentMember, id: UUID): HostNotificationDetail
}
```

Add imports for the new models and `UUID`.

Add to `NotificationOutboxPort.kt`:

```kotlin
fun listHostItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList
fun hostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail?
fun claimOneForClub(clubId: UUID, id: UUID): NotificationOutboxItem?
fun restoreDeadForClub(clubId: UUID, id: UUID): Boolean
```

Make `NotificationOutboxService` implement `ManageHostNotificationsUseCase` and add:

```kotlin
override fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList {
    requireHost(host)
    return notificationOutboxPort.listHostItems(host.clubId, query.copy(limit = query.limit.coerceIn(1, 100)))
}

override fun detail(host: CurrentMember, id: UUID): HostNotificationDetail {
    requireHost(host)
    return notificationOutboxPort.hostItemDetail(host.clubId, id) ?: throw AccessDeniedException("Notification not found")
}

override fun retry(host: CurrentMember, id: UUID): HostNotificationDetail {
    requireHost(host)
    val item = notificationOutboxPort.claimOneForClub(host.clubId, id) ?: throw IllegalStateException("Notification is not retryable")
    deliver(item)
    return detail(host, id)
}

override fun restore(host: CurrentMember, id: UUID): HostNotificationDetail {
    requireHost(host)
    if (!notificationOutboxPort.restoreDeadForClub(host.clubId, id)) {
        throw IllegalStateException("Notification is not restorable")
    }
    return detail(host, id)
}

private fun requireHost(host: CurrentMember) {
    if (!host.isHost) {
        throw AccessDeniedException("Host role required")
    }
}
```

Replace the existing inline host check in `getHostNotificationSummary` with `requireHost(host)`.

- [x] **Step 5: Implement masked DTO mapping and controller endpoints**

Extend `NotificationWebDtos.kt`:

```kotlin
data class HostNotificationItemListResponse(val items: List<HostNotificationItemResponse>)

data class HostNotificationItemResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val attemptCount: Int,
    val nextAttemptAt: String,
    val updatedAt: String,
)

data class HostNotificationDetailResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val subject: String,
    val deepLinkPath: String,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: String,
    val updatedAt: String,
)

fun HostNotificationItemList.toResponse() =
    HostNotificationItemListResponse(items.map { it.toResponse() })

fun HostNotificationItem.toResponse() =
    HostNotificationItemResponse(
        id = id,
        eventType = eventType,
        status = status,
        recipientEmail = recipientEmail.maskEmail(),
        attemptCount = attemptCount,
        nextAttemptAt = nextAttemptAt.toString(),
        updatedAt = updatedAt.toString(),
    )

fun HostNotificationDetail.toResponse() =
    HostNotificationDetailResponse(
        id = id,
        eventType = eventType,
        status = status,
        recipientEmail = recipientEmail.maskEmail(),
        subject = subject,
        deepLinkPath = deepLinkPath,
        attemptCount = attemptCount,
        lastError = lastError,
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
    )

private fun String.maskEmail(): String {
    val parts = split("@", limit = 2)
    val local = parts.getOrNull(0).orEmpty()
    val domain = parts.getOrNull(1).orEmpty()
    return if (local.isBlank() || domain.isBlank()) "숨김" else "${local.first()}***@$domain"
}
```

Extend `HostNotificationController.kt` constructor with `ManageHostNotificationsUseCase`, then add endpoints:

```kotlin
@GetMapping("/items")
fun items(
    host: CurrentMember,
    @RequestParam(required = false) status: NotificationOutboxStatus?,
    @RequestParam(required = false) eventType: NotificationEventType?,
    @RequestParam(defaultValue = "50") limit: Int,
): HostNotificationItemListResponse =
    manageHostNotificationsUseCase.listItems(
        host,
        HostNotificationItemQuery(status = status, eventType = eventType, limit = limit),
    ).toResponse()

@GetMapping("/items/{id}")
fun detail(host: CurrentMember, @PathVariable id: UUID): HostNotificationDetailResponse =
    manageHostNotificationsUseCase.detail(host, id).toResponse()

@PostMapping("/items/{id}/retry")
fun retry(host: CurrentMember, @PathVariable id: UUID): HostNotificationDetailResponse =
    manageHostNotificationsUseCase.retry(host, id).toResponse()

@PostMapping("/items/{id}/restore")
fun restore(host: CurrentMember, @PathVariable id: UUID): HostNotificationDetailResponse =
    manageHostNotificationsUseCase.restore(host, id).toResponse()
```

- [x] **Step 6: Implement JDBC operations**

Add SQL methods in `JdbcNotificationOutboxAdapter.kt`:

```kotlin
override fun listHostItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList {
    val filters = mutableListOf("club_id = ?")
    val args = mutableListOf<Any>(clubId.dbString())
    query.status?.let {
        filters += "status = ?"
        args += it.name
    }
    query.eventType?.let {
        filters += "event_type = ?"
        args += it.name
    }
    args += query.limit.coerceIn(1, 100)
    val items = jdbcTemplate().query(
        """
        select id, event_type, status, recipient_email, attempt_count, next_attempt_at, updated_at
        from notification_outbox
        where ${filters.joinToString(" and ")}
        order by updated_at desc, created_at desc
        limit ?
        """.trimIndent(),
        { rs, _ ->
            HostNotificationItem(
                id = rs.uuid("id"),
                eventType = NotificationEventType.valueOf(rs.getString("event_type")),
                status = NotificationOutboxStatus.valueOf(rs.getString("status")),
                recipientEmail = rs.getString("recipient_email"),
                attemptCount = rs.getInt("attempt_count"),
                nextAttemptAt = rs.utcOffsetDateTime("next_attempt_at"),
                updatedAt = rs.utcOffsetDateTime("updated_at"),
            )
        },
        *args.toTypedArray(),
    )
    return HostNotificationItemList(items)
}
```

Add `hostItemDetail`, `claimOneForClub`, and `restoreDeadForClub` with club predicates and state predicates:

```sql
where club_id = ?
  and id = ?
```

for detail;

```sql
where club_id = ?
  and id = ?
  and status in ('PENDING', 'FAILED')
  and next_attempt_at <= utc_timestamp(6)
```

for retry claim;

```sql
set status = 'PENDING',
    next_attempt_at = utc_timestamp(6),
    locked_at = null,
    updated_at = utc_timestamp(6)
where club_id = ?
  and id = ?
  and status = 'DEAD'
```

for restore.

- [x] **Step 7: Run host notification tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.HostNotificationControllerTest \
  --tests com.readmates.notification.application.service.NotificationOutboxServiceTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification
git commit -m "feat: add host notification operations"
```

---

### Task 5: Add Host Test Mail Backend And Audit

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [x] **Step 1: Add tests for test mail**

Append to `HostNotificationControllerTest.kt`:

```kotlin
@Test
fun `host sends test mail and audit stores masked recipient only`() {
    mockMvc.post("/api/host/notifications/test-mail") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """{"recipientEmail":"external@example.com"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.recipientEmail") { value("e***@example.com") }
        jsonPath("$.status") { value("SENT") }
    }

    val rows = jdbcTemplate.queryForList(
        """
        select recipient_masked_email, recipient_email_hash
        from notification_test_mail_audit
        where club_id = '00000000-0000-0000-0000-000000000001'
        """.trimIndent(),
    )
    assertThat(rows).hasSize(1)
    assertThat(rows.single()["recipient_masked_email"]).isEqualTo("e***@example.com")
    assertThat(rows.single()["recipient_email_hash"].toString()).matches("^[0-9a-f]{64}$")
    assertThat(rows.toString()).doesNotContain("external@example.com")
}

@Test
fun `host test mail rejects second send within cooldown`() {
    repeat(2) { index ->
        mockMvc.post("/api/host/notifications/test-mail") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"recipientEmail":"host@example.com"}"""
        }.andExpect {
            if (index == 0) status { isOk() } else status { isTooManyRequests() }
        }
    }
}
```

Add `import org.springframework.http.MediaType`.

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.HostNotificationControllerTest
```

Expected: FAIL because `/test-mail` does not exist.

- [x] **Step 3: Add models and ports**

Append to `NotificationModels.kt`:

```kotlin
enum class NotificationTestMailStatus {
    SENT,
    FAILED,
}

data class SendNotificationTestMailCommand(
    val recipientEmail: String,
)

data class NotificationTestMailAuditItem(
    val id: UUID,
    val recipientEmail: String,
    val status: NotificationTestMailStatus,
    val lastError: String?,
    val createdAt: OffsetDateTime,
)
```

Append to `NotificationUseCases.kt`:

```kotlin
interface SendNotificationTestMailUseCase {
    fun sendTestMail(host: CurrentMember, command: SendNotificationTestMailCommand): NotificationTestMailAuditItem
    fun listTestMailAudit(host: CurrentMember): List<NotificationTestMailAuditItem>
}
```

Append to `NotificationOutboxPort.kt`:

```kotlin
fun latestTestMailCreatedAt(clubId: UUID, hostMembershipId: UUID): OffsetDateTime?
fun recordTestMailAudit(
    clubId: UUID,
    hostMembershipId: UUID,
    recipientMaskedEmail: String,
    recipientEmailHash: String,
    status: NotificationTestMailStatus,
    error: String?,
): NotificationTestMailAuditItem
fun listTestMailAudit(clubId: UUID): List<NotificationTestMailAuditItem>
```

- [x] **Step 4: Implement service**

Make `NotificationOutboxService` implement `SendNotificationTestMailUseCase`. Add:

```kotlin
override fun sendTestMail(host: CurrentMember, command: SendNotificationTestMailCommand): NotificationTestMailAuditItem {
    requireHost(host)
    val recipient = command.recipientEmail.trim().lowercase()
    require(EMAIL_PATTERN.matches(recipient)) { "Invalid email address" }
    val latest = notificationOutboxPort.latestTestMailCreatedAt(host.clubId, host.membershipId)
    if (latest != null && latest.isAfter(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(60))) {
        throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Test mail cooldown is active")
    }
    val masked = recipient.maskEmail()
    val hash = sha256Hex(recipient)
    return try {
        mailDeliveryPort.send(
            MailDeliveryCommand(
                to = recipient,
                subject = "ReadMates 알림 테스트",
                text = "ReadMates 알림 발송 설정을 확인하기 위한 테스트 메일입니다.",
            ),
        )
        notificationOutboxPort.recordTestMailAudit(host.clubId, host.membershipId, masked, hash, NotificationTestMailStatus.SENT, null)
    } catch (exception: Exception) {
        notificationOutboxPort.recordTestMailAudit(host.clubId, host.membershipId, masked, hash, NotificationTestMailStatus.FAILED, exception.toStorageError())
    }
}
```

Add private helpers:

```kotlin
private val EMAIL_PATTERN = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

private fun String.maskEmail(): String {
    val parts = split("@", limit = 2)
    val local = parts.getOrNull(0).orEmpty()
    val domain = parts.getOrNull(1).orEmpty()
    return if (local.isBlank() || domain.isBlank()) "숨김" else "${local.first()}***@$domain"
}

private fun sha256Hex(value: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
```

Add imports:

```kotlin
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.time.ZoneOffset
```

- [x] **Step 5: Implement controller and DTOs**

Add DTOs to `NotificationWebDtos.kt`:

```kotlin
data class SendNotificationTestMailRequest(val recipientEmail: String)

data class NotificationTestMailAuditResponse(
    val id: UUID,
    val recipientEmail: String,
    val status: NotificationTestMailStatus,
    val lastError: String?,
    val createdAt: String,
)

fun NotificationTestMailAuditItem.toResponse() =
    NotificationTestMailAuditResponse(
        id = id,
        recipientEmail = recipientEmail,
        status = status,
        lastError = lastError,
        createdAt = createdAt.toString(),
    )
```

Add endpoints to `HostNotificationController.kt`:

```kotlin
@PostMapping("/test-mail")
fun sendTestMail(
    host: CurrentMember,
    @RequestBody request: SendNotificationTestMailRequest,
): NotificationTestMailAuditResponse =
    sendNotificationTestMailUseCase.sendTestMail(
        host,
        SendNotificationTestMailCommand(request.recipientEmail),
    ).toResponse()

@GetMapping("/test-mail/audit")
fun testMailAudit(host: CurrentMember): List<NotificationTestMailAuditResponse> =
    sendNotificationTestMailUseCase.listTestMailAudit(host).map { it.toResponse() }
```

- [x] **Step 6: Implement JDBC audit**

In `JdbcNotificationOutboxAdapter.kt`, insert audit rows with `recipient_masked_email` and `recipient_email_hash`, and return `recipientEmail = recipient_masked_email` in the model. Use:

```sql
insert into notification_test_mail_audit (
  id,
  club_id,
  host_membership_id,
  recipient_masked_email,
  recipient_email_hash,
  status,
  last_error
) values (?, ?, ?, ?, ?, ?, ?)
```

`latestTestMailCreatedAt` query:

```sql
select created_at
from notification_test_mail_audit
where club_id = ?
  and host_membership_id = ?
order by created_at desc
limit 1
```

- [x] **Step 7: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.api.HostNotificationControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: add host notification test mail"
```

---

### Task 6: Add Published Review Save Path And REVIEW_PUBLISHED Enqueue

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationOutboxService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/in/MemberArchiveReviewUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/out/MemberArchiveReviewWritePort.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/service/MemberArchiveReviewService.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/MemberArchiveReviewController.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcMemberArchiveReviewWriteAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/MemberArchiveReviewControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`

- [x] **Step 1: Write notification adapter tests for REVIEW_PUBLISHED**

Append to `JdbcNotificationOutboxAdapterTest.kt`:

```kotlin
@Test
fun `enqueueReviewPublished notifies opted-in active members except author`() {
    enableReviewPublished("member2@example.com")
    val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000306")
    val authorMembershipId = membershipIdForEmail("member1@example.com")

    val inserted = adapter.enqueueReviewPublished(clubId, sessionId, authorMembershipId)

    assertThat(inserted).isGreaterThan(0)
    assertThat(notificationRowsFor("REVIEW_PUBLISHED", "member1@example.com")).isZero()
    assertThat(notificationRowsFor("REVIEW_PUBLISHED", "member2@example.com")).isGreaterThan(0)
}
```

Add helpers:

```kotlin
private fun enableReviewPublished(email: String) {
    upsertPreference(email, "review_published_enabled = true")
}

private fun membershipIdForEmail(email: String): UUID =
    UUID.fromString(
        jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ),
    )
```

- [x] **Step 2: Run adapter tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected: FAIL because `enqueueReviewPublished` is not defined.

- [x] **Step 3: Add review event port and service method**

Add to `RecordNotificationEventUseCase`:

```kotlin
fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID)
```

Add to `NotificationOutboxPort`:

```kotlin
fun enqueueReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID): Int
```

Implement in `NotificationOutboxService`:

```kotlin
override fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID) {
    notificationOutboxPort.enqueueReviewPublished(clubId, sessionId, authorMembershipId)
}
```

Update `NoopRecordNotificationEventUseCase` in `HostSessionCommandService.kt` with an empty `recordReviewPublished` method.

- [x] **Step 4: Implement REVIEW_PUBLISHED enqueue SQL**

Add a recipient query in `JdbcNotificationOutboxAdapter.kt`:

```sql
select
  memberships.id as recipient_membership_id,
  users.email,
  coalesce(memberships.short_name, users.name) as display_name,
  sessions.number as session_number,
  sessions.book_title
from sessions
join memberships on memberships.club_id = sessions.club_id
join users on users.id = memberships.user_id
left join notification_preferences on notification_preferences.membership_id = memberships.id
  and notification_preferences.club_id = memberships.club_id
where sessions.club_id = ?
  and sessions.id = ?
  and sessions.state = 'PUBLISHED'
  and sessions.visibility in ('MEMBER', 'PUBLIC')
  and memberships.status = 'ACTIVE'
  and memberships.id <> ?
  and coalesce(notification_preferences.email_enabled, true)
  and coalesce(notification_preferences.review_published_enabled, false)
```

Insert outbox rows with:

```kotlin
eventType = NotificationEventType.REVIEW_PUBLISHED
subject = "새 서평이 공개되었습니다"
bodyText = """
    ${recipient.displayName ?: "멤버"}님,

    ${recipient.sessionNumber}회차 ${recipient.bookTitle}에 새 서평이 공개되었습니다.
    ReadMates에서 확인해 주세요.
""".trimIndent()
deepLinkPath = "/notes?sessionId=$sessionId"
```

Use a new dedupe key helper:

```kotlin
private fun reviewDedupeKey(
    eventType: NotificationEventType,
    aggregateId: UUID,
    authorMembershipId: UUID,
    recipientMembershipId: UUID,
): String = "${eventType.name}:$aggregateId:$authorMembershipId:$recipientMembershipId"
```

- [x] **Step 5: Write archive review controller tests**

Create `server/src/test/kotlin/com/readmates/archive/api/MemberArchiveReviewControllerTest.kt`:

```kotlin
package com.readmates.archive.api

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put

private const val CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL = """
    delete from notification_outbox
    where event_type = 'REVIEW_PUBLISHED';
    delete from notification_preferences
    where review_published_enabled = true;
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_ARCHIVE_REVIEW_NOTIFICATION_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class MemberArchiveReviewControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `member saves public long review for published session and notifies opted-in peers`() {
        enableReviewPublished("member2@example.com")

        mockMvc.put("/api/archive/sessions/00000000-0000-0000-0000-000000000306/my-long-review") {
            with(user("member1@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"발행된 회차에 새로 공개하는 서평입니다."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.body") { value("발행된 회차에 새로 공개하는 서평입니다.") }
        }

        val notifications = jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_outbox
            where event_type = 'REVIEW_PUBLISHED'
              and recipient_email = 'member2@example.com'
            """.trimIndent(),
            Int::class.java,
        )
        assertThat(notifications).isEqualTo(1)
    }

    private fun enableReviewPublished(email: String) {
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, review_published_enabled)
            select memberships.id, memberships.club_id, true
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            on duplicate key update review_published_enabled = true
            """.trimIndent(),
            email,
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 6: Run archive review tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.MemberArchiveReviewControllerTest
```

Expected: FAIL because the endpoint does not exist.

- [x] **Step 7: Implement archive review use case and controller**

Create `MemberArchiveReviewUseCases.kt`:

```kotlin
package com.readmates.archive.application.port.`in`

import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class SaveMemberArchiveLongReviewCommand(
    val member: CurrentMember,
    val sessionId: UUID,
    val body: String,
)

data class SaveMemberArchiveLongReviewResult(
    val sessionId: UUID,
    val body: String,
    val newlyPublic: Boolean,
)

interface SaveMemberArchiveLongReviewUseCase {
    fun save(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult
}
```

Create `MemberArchiveReviewController.kt`:

```kotlin
package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class SaveMemberArchiveLongReviewRequest(val body: String)
data class SaveMemberArchiveLongReviewResponse(val sessionId: UUID, val body: String)

@RestController
@RequestMapping("/api/archive/sessions/{sessionId}/my-long-review")
class MemberArchiveReviewController(
    private val useCase: SaveMemberArchiveLongReviewUseCase,
) {
    @PutMapping
    fun save(
        currentMember: CurrentMember,
        @PathVariable sessionId: UUID,
        @RequestBody request: SaveMemberArchiveLongReviewRequest,
    ): SaveMemberArchiveLongReviewResponse {
        val result = useCase.save(SaveMemberArchiveLongReviewCommand(currentMember, sessionId, request.body))
        return SaveMemberArchiveLongReviewResponse(result.sessionId, result.body)
    }
}
```

- [x] **Step 8: Implement archive review service and persistence**

Create `MemberArchiveReviewWritePort.kt`:

```kotlin
package com.readmates.archive.application.port.out

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewResult

interface MemberArchiveReviewWritePort {
    fun saveLongReview(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult
}
```

Create `MemberArchiveReviewService.kt`:

```kotlin
package com.readmates.archive.application.service

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewUseCase
import com.readmates.archive.application.port.out.MemberArchiveReviewWritePort
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MemberArchiveReviewService(
    private val writePort: MemberArchiveReviewWritePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
) : SaveMemberArchiveLongReviewUseCase {
    @Transactional
    override fun save(command: SaveMemberArchiveLongReviewCommand) =
        writePort.saveLongReview(command).also { result ->
            if (result.newlyPublic) {
                recordNotificationEventUseCase.recordReviewPublished(
                    clubId = command.member.clubId,
                    sessionId = command.sessionId,
                    authorMembershipId = command.member.membershipId,
                )
            }
        }
}
```

In `JdbcMemberArchiveReviewWriteAdapter`, save a `PUBLIC` long review only when the session is `PUBLISHED`, `visibility in ('MEMBER','PUBLIC')`, the member belongs to the session participants, and the body is non-blank. Compute `newlyPublic` by reading the previous row before upsert:

```sql
select visibility
from long_reviews
where club_id = ?
  and session_id = ?
  and membership_id = ?
```

Then upsert:

```sql
insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
values (?, ?, ?, ?, ?, 'PUBLIC')
on duplicate key update
  body = values(body),
  visibility = values(visibility),
  updated_at = utc_timestamp(6)
```

Return `newlyPublic = previousVisibility != "PUBLIC"`.

- [x] **Step 9: Run review notification tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest \
  --tests com.readmates.archive.api.MemberArchiveReviewControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 10: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/main/kotlin/com/readmates/archive \
  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/MemberArchiveReviewControllerTest.kt
git commit -m "feat: notify opted-in members about public reviews"
```

---

### Task 7: Add Frontend API Contracts

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Test: `front/tests/unit/host-dashboard.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Add contract types**

Append to `front/features/archive/api/archive-contracts.ts`:

```ts
export type NotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

export type NotificationPreferencesResponse = {
  emailEnabled: boolean;
  events: Record<NotificationEventType, boolean>;
};

export type NotificationPreferencesRequest = NotificationPreferencesResponse;
```

Append to `front/features/host/api/host-contracts.ts`:

```ts
export type HostNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD";
export type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

export type HostNotificationItem = {
  id: string;
  eventType: HostNotificationEventType;
  status: HostNotificationStatus;
  recipientEmail: string;
  attemptCount: number;
  nextAttemptAt: string;
  updatedAt: string;
};

export type HostNotificationItemListResponse = {
  items: HostNotificationItem[];
};

export type HostNotificationDetailResponse = HostNotificationItem & {
  subject: string;
  deepLinkPath: string;
  lastError: string | null;
  createdAt: string;
};

export type SendNotificationTestMailRequest = {
  recipientEmail: string;
};

export type NotificationTestMailAuditItem = {
  id: string;
  recipientEmail: string;
  status: "SENT" | "FAILED";
  lastError: string | null;
  createdAt: string;
};
```

- [x] **Step 2: Add API functions**

Append to `front/features/archive/api/archive-api.ts`:

```ts
export function fetchNotificationPreferences() {
  return readmatesFetch<NotificationPreferencesResponse>("/api/me/notifications/preferences");
}

export function saveNotificationPreferences(request: NotificationPreferencesRequest) {
  return readmatesFetch<NotificationPreferencesResponse>("/api/me/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
```

Add imports for the new types.

Append to `front/features/host/api/host-api.ts`:

```ts
export function fetchHostNotificationItems(status?: HostNotificationStatus) {
  const search = status ? `?status=${encodeURIComponent(status)}` : "";
  return readmatesFetch<HostNotificationItemListResponse>(`/api/host/notifications/items${search}`);
}

export function fetchHostNotificationDetail(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(`/api/host/notifications/items/${encodeURIComponent(id)}`);
}

export function retryHostNotification(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(`/api/host/notifications/items/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });
}

export function restoreHostNotification(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(`/api/host/notifications/items/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
}

export function sendHostNotificationTestMail(request: SendNotificationTestMailRequest) {
  return readmatesFetch<NotificationTestMailAuditItem>("/api/host/notifications/test-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function fetchHostNotificationTestMailAudit() {
  return readmatesFetch<NotificationTestMailAuditItem[]>("/api/host/notifications/test-mail/audit");
}
```

Add imports for the new types.

- [x] **Step 3: Run frontend type and related unit tests**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/host-dashboard.test.tsx front/tests/unit/my-page.test.tsx
```

Expected: the API contract files typecheck; the existing my-page read-only notification test fails until Task 8 replaces that UI.

- [x] **Step 4: Commit**

```bash
git add front/features/host/api front/features/archive/api
git commit -m "feat: add notification frontend contracts"
```

---

### Task 8: Replace Member My-Page Notification Rows With Preferences UI

**Files:**
- Modify: `front/features/archive/model/archive-model.ts`
- Modify: `front/features/archive/route/my-page-data.ts`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Update tests from read-only rows to editable preferences**

In `front/tests/unit/my-page.test.tsx`, replace the test named `renders notifications as read-only pending status rows` with:

```ts
it("renders editable notification preferences and saves changes", async () => {
  const user = userEvent.setup();
  const onSaveNotificationPreferences = vi.fn().mockResolvedValue({
    emailEnabled: false,
    events: {
      NEXT_BOOK_PUBLISHED: true,
      SESSION_REMINDER_DUE: true,
      FEEDBACK_DOCUMENT_PUBLISHED: true,
      REVIEW_PUBLISHED: false,
    },
  });

  renderMyPage({
    notificationPreferences: {
      emailEnabled: true,
      events: {
        NEXT_BOOK_PUBLISHED: true,
        SESSION_REMINDER_DUE: true,
        FEEDBACK_DOCUMENT_PUBLISHED: true,
        REVIEW_PUBLISHED: false,
      },
    },
    onSaveNotificationPreferences,
  });

  await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
  await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));

  expect(onSaveNotificationPreferences).toHaveBeenCalledWith({
    emailEnabled: false,
    events: {
      NEXT_BOOK_PUBLISHED: true,
      SESSION_REMINDER_DUE: true,
      FEEDBACK_DOCUMENT_PUBLISHED: true,
      REVIEW_PUBLISHED: false,
    },
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/my-page.test.tsx
```

Expected: FAIL because `notificationPreferences` props do not exist.

- [x] **Step 3: Add model labels and props**

Append to `front/features/archive/model/archive-model.ts`:

```ts
import type { NotificationEventType, NotificationPreferencesResponse } from "@/features/archive/api/archive-contracts";

export const notificationEventLabels: Record<NotificationEventType, { label: string; sub: string }> = {
  NEXT_BOOK_PUBLISHED: { label: "다음 책 공개", sub: "예정 세션이 멤버에게 열릴 때" },
  SESSION_REMINDER_DUE: { label: "모임 전날 리마인더", sub: "모임 하루 전 준비 알림" },
  FEEDBACK_DOCUMENT_PUBLISHED: { label: "피드백 문서 등록", sub: "참석 회차의 피드백 문서가 올라올 때" },
  REVIEW_PUBLISHED: { label: "다른 멤버의 서평 공개", sub: "발행된 회차에 새 공개 서평이 올라올 때" },
};

export const notificationEventOrder: NotificationEventType[] = [
  "NEXT_BOOK_PUBLISHED",
  "SESSION_REMINDER_DUE",
  "FEEDBACK_DOCUMENT_PUBLISHED",
  "REVIEW_PUBLISHED",
];

export const defaultNotificationPreferences: NotificationPreferencesResponse = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};
```

If this creates duplicate import placement, move the type import to the existing import block at the top of the file.

- [x] **Step 4: Load and save preferences in the route**

Modify `my-page-data.ts` to include preferences:

```ts
import { fetchNotificationPreferences } from "@/features/archive/api/archive-api";
import type { NotificationPreferencesResponse } from "@/features/archive/api/archive-contracts";
```

Add field:

```ts
notificationPreferences: NotificationPreferencesResponse;
```

In inactive data return, use `defaultNotificationPreferences`. In loader `Promise.all`, include `fetchNotificationPreferences()`.

Modify `my-page-route.tsx` to pass:

```tsx
notificationPreferences={loaderData.notificationPreferences}
onSaveNotificationPreferences={saveNotificationPreferences}
```

- [x] **Step 5: Replace `NotificationsSection`**

In `front/features/archive/ui/my-page.tsx`, update props:

```ts
notificationPreferences: NotificationPreferencesResponse;
onSaveNotificationPreferences: (preferences: NotificationPreferencesRequest) => Promise<NotificationPreferencesResponse>;
```

Replace `NotificationsSection()` with a stateful component that renders switches:

```tsx
function NotificationsSection({
  preferences,
  onSave,
}: {
  preferences: NotificationPreferencesResponse;
  onSave: (preferences: NotificationPreferencesRequest) => Promise<NotificationPreferencesResponse>;
}) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const saved = await onSave(draft);
      setDraft(saved);
    } catch {
      setError("알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHeader eyebrow="설정" title="알림" />
      <div className="surface" style={{ padding: "6px" }}>
        <NotificationSwitchRow
          label="이메일 알림"
          sub="ReadMates에서 보내는 이메일 알림 전체"
          checked={draft.emailEnabled}
          onChange={(checked) => setDraft({ ...draft, emailEnabled: checked })}
        />
        {notificationEventOrder.map((event) => (
          <NotificationSwitchRow
            key={event}
            label={notificationEventLabels[event].label}
            sub={draft.emailEnabled ? notificationEventLabels[event].sub : "전체 알림 꺼짐"}
            checked={draft.events[event]}
            disabled={!draft.emailEnabled}
            onChange={(checked) => setDraft({ ...draft, events: { ...draft.events, [event]: checked } })}
          />
        ))}
        {error ? <div className="small" role="alert">{error}</div> : null}
        <button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={() => void submit()}>
          {saving ? "저장 중" : "알림 설정 저장"}
        </button>
      </div>
    </section>
  );
}
```

Create `NotificationSwitchRow` in the same file using a real checkbox with `role="switch"`:

```tsx
function NotificationSwitchRow({
  label,
  sub,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="row-between" style={{ padding: "14px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <label htmlFor={id}>
        <span className="body" style={{ fontSize: "14px", fontWeight: 500 }}>{label}</span>
        <span className="tiny" style={{ display: "block" }}>{sub}</span>
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </div>
  );
}
```

- [x] **Step 6: Run my-page tests**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/my-page.test.tsx
```

Expected: `PASS`.

- [x] **Step 7: Commit**

```bash
git add front/features/archive front/tests/unit/my-page.test.tsx
git commit -m "feat: add member notification settings UI"
```

---

### Task 9: Add Host Notification Operations Page

**Files:**
- Create: `front/features/host/route/host-notifications-data.ts`
- Create: `front/features/host/route/host-notifications-route.tsx`
- Create: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/src/app/host-route-elements.tsx`
- Modify: `front/src/app/router.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [x] **Step 1: Write frontend tests**

Create `front/tests/unit/host-notifications.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";

const summary = { pending: 2, failed: 1, dead: 1, sentLast24h: 3, latestFailures: [] };
const items = [
  {
    id: "notification-1",
    eventType: "FEEDBACK_DOCUMENT_PUBLISHED" as const,
    status: "DEAD" as const,
    recipientEmail: "m***@example.com",
    attemptCount: 5,
    nextAttemptAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
  },
];

describe("HostNotificationsPage", () => {
  it("renders notification ledger and restores dead item", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);

    render(
      <HostNotificationsPage
        summary={summary}
        items={items}
        audit={[]}
        onProcess={vi.fn()}
        onRetry={vi.fn()}
        onRestore={onRestore}
        onSendTestMail={vi.fn()}
      />,
    );

    expect(screen.getByText("알림 발송 장부")).toBeInTheDocument();
    expect(screen.getByText("m***@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "복구" }));
    await user.click(screen.getByRole("button", { name: "복구 확인" }));

    expect(onRestore).toHaveBeenCalledWith("notification-1");
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/host-notifications.test.tsx
```

Expected: FAIL because `HostNotificationsPage` does not exist.

- [x] **Step 3: Add loader/actions**

Create `front/features/host/route/host-notifications-data.ts`:

```ts
import {
  fetchHostNotificationItems,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import type { HostNotificationItem, HostNotificationSummary, NotificationTestMailAuditItem } from "@/features/host/api/host-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  items: HostNotificationItem[];
  audit: NotificationTestMailAuditItem[];
};

export async function hostNotificationsLoader(): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth();
  const [summary, items, audit] = await Promise.all([
    fetchHostNotificationSummary(),
    fetchHostNotificationItems(),
    fetchHostNotificationTestMailAudit(),
  ]);
  return { summary, items: items.items, audit };
}

export const hostNotificationsActions = {
  process: async () => {
    const response = await processHostNotifications();
    if (!response.ok) throw new Error("Notification process failed");
  },
  retry: retryHostNotification,
  restore: restoreHostNotification,
  sendTestMail: sendHostNotificationTestMail,
};
```

- [x] **Step 4: Add route shell**

Create `front/features/host/route/host-notifications-route.tsx`:

```tsx
import { useLoaderData, useRevalidator } from "react-router-dom";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import { hostNotificationsActions, type HostNotificationsRouteData } from "./host-notifications-data";

export function HostNotificationsRoute() {
  const data = useLoaderData() as HostNotificationsRouteData;
  const revalidator = useRevalidator();

  async function refresh(action: () => Promise<unknown>) {
    await action();
    revalidator.revalidate();
  }

  return (
    <HostNotificationsPage
      summary={data.summary}
      items={data.items}
      audit={data.audit}
      onProcess={() => refresh(hostNotificationsActions.process)}
      onRetry={(id) => refresh(() => hostNotificationsActions.retry(id))}
      onRestore={(id) => refresh(() => hostNotificationsActions.restore(id))}
      onSendTestMail={(request) => refresh(() => hostNotificationsActions.sendTestMail(request))}
    />
  );
}
```

- [x] **Step 5: Add UI component**

Create `front/features/host/ui/host-notifications-page.tsx`:

```tsx
import { useState } from "react";
import type {
  HostNotificationItem,
  HostNotificationSummary,
  NotificationTestMailAuditItem,
  SendNotificationTestMailRequest,
} from "@/features/host/api/host-contracts";

export function HostNotificationsPage({
  summary,
  items,
  audit,
  onProcess,
  onRetry,
  onRestore,
  onSendTestMail,
}: {
  summary: HostNotificationSummary;
  items: HostNotificationItem[];
  audit: NotificationTestMailAuditItem[];
  onProcess: () => Promise<unknown>;
  onRetry: (id: string) => Promise<unknown>;
  onRestore: (id: string) => Promise<unknown>;
  onSendTestMail: (request: SendNotificationTestMailRequest) => Promise<unknown>;
}) {
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");

  return (
    <main className="stack" style={{ gap: 18 }}>
      <header className="row-between">
        <div>
          <p className="eyebrow">호스트 운영</p>
          <h1 className="h2 editorial" style={{ margin: 0 }}>알림 발송 장부</h1>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => void onProcess()}>
          대기/실패 처리
        </button>
      </header>

      <section className="surface" style={{ padding: 18 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="badge">대기 {summary.pending}</span>
          <span className="badge">실패 {summary.failed}</span>
          <span className="badge">중단 {summary.dead}</span>
          <span className="badge">최근 24시간 {summary.sentLast24h}</span>
        </div>
      </section>

      <section className="surface" style={{ padding: 18 }}>
        <h2 className="eyebrow">발송 목록</h2>
        <div className="stack" style={{ gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} className="row-between" style={{ borderTop: "1px solid var(--line-soft)", padding: "12px 0" }}>
              <div>
                <strong className="body">{item.eventType}</strong>
                <div className="tiny">{item.recipientEmail} · {item.status} · {item.attemptCount}회</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {item.status === "PENDING" || item.status === "FAILED" ? (
                  <button className="btn btn-quiet btn-sm" type="button" onClick={() => void onRetry(item.id)}>재시도</button>
                ) : null}
                {item.status === "DEAD" ? (
                  <button className="btn btn-quiet btn-sm" type="button" onClick={() => setRestoreTarget(item.id)}>복구</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface" style={{ padding: 18 }}>
        <h2 className="eyebrow">테스트 메일</h2>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            type="email"
            value={testEmail}
            onChange={(event) => setTestEmail(event.currentTarget.value)}
            aria-label="테스트 메일 주소"
          />
          <button className="btn btn-primary btn-sm" type="button" onClick={() => void onSendTestMail({ recipientEmail: testEmail })}>
            테스트 발송
          </button>
        </div>
        <ul>
          {audit.map((row) => (
            <li key={row.id}>{row.recipientEmail} · {row.status}</li>
          ))}
        </ul>
      </section>

      {restoreTarget ? (
        <div role="dialog" aria-modal="true" className="modal">
          <p className="body">중단된 알림을 다시 발송 대기 상태로 복구합니다.</p>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => void onRestore(restoreTarget)}>
            복구 확인
          </button>
          <button className="btn btn-quiet btn-sm" type="button" onClick={() => setRestoreTarget(null)}>
            취소
          </button>
        </div>
      ) : null}
    </main>
  );
}
```

- [x] **Step 6: Register route**

Export route modules in `front/features/host/index.ts`:

```ts
export { HostNotificationsRoute } from "@/features/host/route/host-notifications-route";
export {
  hostNotificationsActions,
  hostNotificationsLoader,
  type HostNotificationsRouteData,
} from "@/features/host/route/host-notifications-data";
```

Modify `front/src/app/host-route-elements.tsx`:

```tsx
import {
  EditHostSessionRoute,
  HostDashboardRoute,
  HostNotificationsRoute,
  NewHostSessionRoute,
} from "@/features/host";

export function HostNotificationsRouteElement() {
  return <HostNotificationsRoute />;
}
```

Modify `front/src/app/router.tsx` imports and route list:

```tsx
import {
  EditHostSessionRouteElement,
  HostDashboardRouteElement,
  HostNotificationsRouteElement,
  NewHostSessionRouteElement,
} from "@/src/app/host-route-elements";
```

Add child under `/app/host`:

```tsx
{
  path: "notifications",
  element: <HostNotificationsRouteElement />,
  loader: hostNotificationsLoader,
  errorElement: <HostRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="알림 발송 장부를 불러오는 중" variant="host" />,
},
```

- [x] **Step 7: Run host notification UI tests**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/host-notifications.test.tsx
```

Expected: `PASS`.

- [x] **Step 8: Commit**

```bash
git add front/features/host front/src/app/router.tsx front/src/app/host-route-elements.tsx front/tests/unit/host-notifications.test.tsx
git commit -m "feat: add host notification operations page"
```

---

### Task 10: Link Host Dashboard To Notification Operations

**Files:**
- Modify: `front/features/host/components/host-dashboard.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`

- [x] **Step 1: Add failing dashboard link test**

Append to `front/tests/unit/host-dashboard.test.tsx`:

```tsx
it("links to the host notification operations page", () => {
  render(
    <HostDashboard
      current={current}
      data={dashboard}
      hostSessions={[]}
      notifications={notificationSummary}
      actions={hostDashboardActions}
    />,
  );

  expect(screen.getByRole("link", { name: "알림 발송 장부" })).toHaveAttribute("href", "/app/host/notifications");
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/host-dashboard.test.tsx
```

Expected: FAIL because the link does not exist.

- [x] **Step 3: Add the link**

In `HostNotificationLedger`, add below the badge row:

```tsx
<Link to="/app/host/notifications" className="btn btn-quiet btn-sm" style={{ marginTop: 12 }}>
  알림 발송 장부
</Link>
```

If `Link` is not imported in the file, import the same route-aware link primitive already used in this component or nearby host components.

- [x] **Step 4: Run test**

Run:

```bash
pnpm --dir front test -- --run front/tests/unit/host-dashboard.test.tsx
```

Expected: `PASS`.

- [x] **Step 5: Commit**

```bash
git add front/features/host/components/host-dashboard.tsx front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: link host dashboard to notification ledger"
```

---

### Task 11: Run Full Verification And Update Docs If Runtime Behavior Changed

**Files:**
- Modify when runtime behavior guidance changes: `docs/deploy/oci-backend.md`
- Modify when test command guidance changes: `docs/development/test-guide.md`

- [ ] **Step 1: Run server notification tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.*'
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Run archive review tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.MemberArchiveReviewControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Run full server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all three commands exit 0.

- [ ] **Step 5: Run e2e because this changes API/user flow surfaces**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: exit 0. When environment dependencies prevent this command from running, record the exact missing dependency or server startup failure in the final implementation note.

- [ ] **Step 6: Check docs need**

If test-mail cooldown, host restore, or member preferences require operator guidance, update `docs/deploy/oci-backend.md` under Email Notification Operations with:

```markdown
- Host notification operations live at `/app/host/notifications`.
- Hosts can process pending/failed rows, restore `DEAD` rows to retryable status, and send fixed-template test mail.
- Test mail audit stores masked recipient email and a hash, not the raw recipient email.
- Member notification preferences default existing operational notifications on and review-published notifications off.
```

Run:

```bash
git diff --check -- docs/deploy/oci-backend.md docs/development/test-guide.md
```

Expected: no output.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: only intended changed files are present. Existing unrelated untracked files under `docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-*.md` may still appear and must not be staged unless the user asks.

---

## Plan Self-Review

Spec coverage:

- Member preferences: Task 1, Task 2, Task 3, Task 8.
- Existing three-event delivery defaults: Task 1, Task 2, Task 3.
- Host operations page: Task 4, Task 5, Task 9, Task 10.
- Dead restore and retry: Task 4 and Task 9.
- Test mail with masked+hashed audit: Task 1, Task 5, Task 9.
- `REVIEW_PUBLISHED`: Task 1 and Task 6.
- Current code gap for published review save: Task 6.
- Privacy and raw email masking: Task 4, Task 5, Task 9.
- Verification: Task 11.

Completeness scan:

- The plan has concrete file paths, code snippets, verification commands, and no deferred implementation instructions.

Type consistency:

- `NotificationEventType` uses the same four string values across Kotlin and TypeScript.
- Member preference field names use `emailEnabled` in JSON and `email_enabled` in SQL.
- Host notification item types use masked `recipientEmail` consistently in frontend responses.
