# ReadMates Manual Notification Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build host-controlled manual notification dispatch for three existing notification templates, then redesign the host and member notification screens around that workflow.

**Architecture:** Manual dispatch is a host-created notification event that enters the existing `notification_event_outbox -> Kafka -> notification_deliveries/member_notifications` pipeline. Preview and confirm stay in the notification application service, persistence stays behind new outbound ports, and frontend route modules own API calls/state while UI components remain prop/callback driven.

**Tech Stack:** Kotlin/Spring Boot, MySQL/Flyway, Kafka notification pipeline, React/Vite, React Router 7, Vitest/Testing Library, Playwright E2E.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Architecture source of truth: `docs/development/architecture.md`

## File Structure

### Server

- Create `server/src/main/resources/db/mysql/migration/V27__manual_notification_dispatch.sql`
  - Adds persisted preview rows and manual dispatch audit rows.
- Modify `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
  - Adds manual dispatch enums, command/result models, and `manualDispatch` payload metadata.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
  - Adds host manual notification use case contract.
- Create `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
  - Defines persistence queries and writes for options, preview, confirm, and recent dispatches.
- Create `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
  - Owns host authorization, template availability, preview hash, duplicate policy, and confirm orchestration.
- Create `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
  - Implements the new outbound port with JDBC SQL.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
  - Routes manual events through manual target resolution and requested channel planning.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
  - Adds `/manual/options`, `/manual/preview`, and `/manual` endpoints.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
  - Adds request/response DTOs and masking-safe mapping.
- Modify `server/src/main/kotlin/com/readmates/notification/application/NotificationApplicationException.kt`
  - Adds manual dispatch error codes.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt`
  - Maps manual dispatch errors to public-safe HTTP status codes.
- Test `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

### Frontend

- Modify `front/features/host/api/host-contracts.ts`
  - Adds manual dispatch contracts.
- Modify `front/features/host/api/host-api.ts`
  - Adds manual options, preview, confirm calls.
- Modify `front/features/host/route/host-notifications-data.ts`
  - Loads manual dispatch options and exposes preview/confirm actions.
- Modify `front/features/host/route/host-notifications-route.tsx`
  - Owns workbench state and refresh after confirm.
- Modify `front/features/host/ui/host-notifications-page.tsx`
  - Reorders page around the workbench first and ledger second.
- Create `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Pure UI for template/session/audience/channel selection.
- Create `front/features/host/ui/notifications/manual-notification-member-picker.tsx`
  - Pure UI for exclude/include member adjustment.
- Create `front/features/host/ui/notifications/manual-notification-preview.tsx`
  - Pure UI for preview counts, duplicate warning, and confirm.
- Create `front/features/host/ui/session-editor/session-editor-notifications.tsx`
  - Pure UI for session edit quick links.
- Modify `front/features/host/ui/host-session-editor.tsx`
  - Renders the quick-link section after feedback/publication management context.
- Modify `front/features/notifications/ui/member-notifications-page.tsx`
  - Improves row hierarchy, unread marker, labels, and mobile wrapping.
- Test `front/tests/unit/host-notifications.test.tsx`
- Test `front/tests/unit/host-session-editor.test.tsx` if the existing test file is present; otherwise create `front/tests/unit/host-session-notifications.test.tsx`.
- Test `front/tests/unit/member-notifications.test.tsx`
- E2E `front/tests/e2e/multi-club-flow.spec.ts` or a new focused `front/tests/e2e/manual-notifications.spec.ts`

---

### Task 1: Server Models, Migration, and Port Contracts

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V27__manual_notification_dispatch.sql`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`

- [ ] **Step 1: Write the failing model test**

Create `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class NotificationManualDispatchModelsTest {
    @Test
    fun `manual template defaults match host workflow decisions`() {
        assertThat(defaultManualAudience(NotificationEventType.NEXT_BOOK_PUBLISHED))
            .isEqualTo(ManualNotificationAudience.ALL_ACTIVE_MEMBERS)
        assertThat(defaultManualAudience(NotificationEventType.SESSION_REMINDER_DUE))
            .isEqualTo(ManualNotificationAudience.ALL_ACTIVE_MEMBERS)
        assertThat(defaultManualAudience(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED))
            .isEqualTo(ManualNotificationAudience.CONFIRMED_ATTENDEES)
    }

    @Test
    fun `manual dispatch payload exposes requested channels and target edits`() {
        val excluded = UUID.nameUUIDFromBytes("excluded".toByteArray())
        val payload = NotificationManualDispatchPayload(
            id = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
            source = NotificationDispatchSource.MANUAL,
            requestedByMembershipId = UUID.nameUUIDFromBytes("host".toByteArray()),
            requestedChannels = ManualNotificationRequestedChannels.BOTH,
            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
            excludedMembershipIds = listOf(excluded),
            includedMembershipIds = emptyList(),
            resend = true,
            sendMode = ManualNotificationSendMode.NOW,
        )

        assertThat(payload.excludedMembershipIds).containsExactly(excluded)
        assertThat(payload.includedMembershipIds).isEmpty()
        assertThat(payload.resend).isTrue()
    }
}
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest'
```

Expected: FAIL because `NotificationManualDispatchPayload` and related enums do not exist.

- [ ] **Step 3: Add manual dispatch models**

In `NotificationModels.kt`, extend `NotificationEventPayload` and add the new types below the existing payload model:

```kotlin
data class NotificationEventPayload(
    val sessionId: UUID? = null,
    val sessionNumber: Int? = null,
    val bookTitle: String? = null,
    val documentVersion: Int? = null,
    val authorMembershipId: UUID? = null,
    val targetDate: LocalDate? = null,
    val manualDispatch: NotificationManualDispatchPayload? = null,
)

enum class NotificationDispatchSource {
    AUTOMATIC,
    MANUAL,
}

enum class ManualNotificationAudience {
    ALL_ACTIVE_MEMBERS,
    SESSION_PARTICIPANTS,
    CONFIRMED_ATTENDEES,
}

enum class ManualNotificationRequestedChannels {
    IN_APP,
    EMAIL,
    BOTH,
}

enum class ManualNotificationSendMode {
    NOW,
}

enum class ManualNotificationEligibility {
    ELIGIBLE,
    INELIGIBLE,
    EMAIL_DISABLED,
    EMAIL_MISSING,
}

data class NotificationManualDispatchPayload(
    val id: UUID,
    val source: NotificationDispatchSource = NotificationDispatchSource.MANUAL,
    val requestedByMembershipId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val resend: Boolean = false,
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
)

fun defaultManualAudience(eventType: NotificationEventType): ManualNotificationAudience =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED,
        NotificationEventType.SESSION_REMINDER_DUE,
        -> ManualNotificationAudience.ALL_ACTIVE_MEMBERS
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> ManualNotificationAudience.CONFIRMED_ATTENDEES
        NotificationEventType.REVIEW_PUBLISHED -> ManualNotificationAudience.SESSION_PARTICIPANTS
    }

fun allowedManualAudiences(eventType: NotificationEventType): Set<ManualNotificationAudience> =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED,
        NotificationEventType.SESSION_REMINDER_DUE,
        -> setOf(ManualNotificationAudience.ALL_ACTIVE_MEMBERS, ManualNotificationAudience.SESSION_PARTICIPANTS)
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
            setOf(ManualNotificationAudience.CONFIRMED_ATTENDEES, ManualNotificationAudience.SESSION_PARTICIPANTS)
        NotificationEventType.REVIEW_PUBLISHED -> emptySet()
    }
```

Then add command and response models near the existing host notification models:

```kotlin
data class ManualNotificationOptions(
    val templates: List<ManualNotificationTemplateOption>,
    val members: List<ManualNotificationMemberOption>,
    val nextCursor: String?,
)

data class ManualNotificationTemplateOption(
    val eventType: NotificationEventType,
    val label: String,
    val enabled: Boolean,
    val disabledReason: String?,
    val defaultAudience: ManualNotificationAudience,
    val allowedAudiences: Set<ManualNotificationAudience>,
    val defaultChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
)

data class ManualNotificationMemberOption(
    val membershipId: UUID,
    val displayName: String,
    val maskedEmail: String,
    val role: String,
    val membershipStatus: String,
    val sessionParticipationStatus: String?,
    val attendanceStatus: String?,
    val emailEligibility: ManualNotificationEligibility,
    val inAppEligibility: ManualNotificationEligibility,
)

data class ManualNotificationSelection(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val excludedMembershipIds: List<UUID>,
    val includedMembershipIds: List<UUID>,
    val sendMode: ManualNotificationSendMode,
)

data class ManualNotificationPreviewCommand(
    val selection: ManualNotificationSelection,
)

data class ManualNotificationConfirmCommand(
    val previewId: UUID,
    val selection: ManualNotificationSelection,
    val resendConfirmed: Boolean,
)

data class ManualNotificationPreview(
    val previewId: UUID,
    val expiresAt: OffsetDateTime,
    val template: ManualNotificationTemplatePreview,
    val audience: ManualNotificationAudiencePreview,
    val channels: ManualNotificationChannelPreview,
    val duplicates: ManualNotificationDuplicatePreview,
    val warnings: List<ManualNotificationWarning>,
)

data class ManualNotificationTemplatePreview(
    val eventType: NotificationEventType,
    val label: String,
    val subject: String,
    val bodyPreview: String,
)

data class ManualNotificationAudiencePreview(
    val baseGroup: ManualNotificationAudience,
    val baseCount: Int,
    val excludedCount: Int,
    val includedCount: Int,
    val finalTargetCount: Int,
)

data class ManualNotificationChannelPreview(
    val requested: ManualNotificationRequestedChannels,
    val inAppEligibleCount: Int,
    val emailEligibleCount: Int,
    val emailSkippedByPreferenceCount: Int,
    val emailMissingCount: Int,
)

data class ManualNotificationDuplicatePreview(
    val requiresResendConfirmation: Boolean,
    val recentDispatches: List<ManualNotificationRecentDispatch>,
)

data class ManualNotificationRecentDispatch(
    val manualDispatchId: UUID,
    val eventType: NotificationEventType,
    val requestedChannels: ManualNotificationRequestedChannels,
    val createdAt: OffsetDateTime,
    val requestedBy: String,
    val targetCount: Int,
)

data class ManualNotificationWarning(
    val code: String,
    val message: String,
)

data class ManualNotificationConfirmResult(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val status: NotificationEventOutboxStatus,
    val createdAt: OffsetDateTime,
    val summary: ManualNotificationConfirmSummary,
)

data class ManualNotificationConfirmSummary(
    val targetCount: Int,
    val requestedChannels: ManualNotificationRequestedChannels,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
)
```

- [ ] **Step 4: Add inbound and outbound port contracts**

Append to `NotificationUseCases.kt`:

```kotlin
interface ManageManualHostNotificationsUseCase {
    fun options(host: CurrentMember, sessionId: UUID?, pageRequest: PageRequest): ManualNotificationOptions
    fun preview(host: CurrentMember, command: ManualNotificationPreviewCommand): ManualNotificationPreview
    fun confirm(host: CurrentMember, command: ManualNotificationConfirmCommand): ManualNotificationConfirmResult
}
```

Create `ManualNotificationDispatchPort.kt`:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationPreview
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.util.UUID

data class ManualNotificationSessionContext(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val state: String,
    val visibility: String,
    val feedbackDocumentUploaded: Boolean,
)

data class ManualNotificationTargetSnapshot(
    val baseCount: Int,
    val excludedCount: Int,
    val includedCount: Int,
    val finalTargetCount: Int,
    val inAppEligibleCount: Int,
    val emailEligibleCount: Int,
    val emailSkippedByPreferenceCount: Int,
    val emailMissingCount: Int,
)

data class ManualNotificationPreviewRecord(
    val id: UUID,
    val clubId: UUID,
    val hostMembershipId: UUID,
    val selectionHash: String,
    val expiresAt: OffsetDateTime,
)

data class ManualNotificationStoredDispatch(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val createdAt: OffsetDateTime,
)

interface ManualNotificationDispatchPort {
    fun findSessionContext(clubId: UUID, sessionId: UUID): ManualNotificationSessionContext?
    fun listMembers(clubId: UUID, sessionId: UUID?, pageRequest: PageRequest): CursorPage<ManualNotificationMemberOption>
    fun previewTargets(clubId: UUID, selection: ManualNotificationSelection): ManualNotificationTargetSnapshot
    fun recentDispatches(clubId: UUID, sessionId: UUID, eventType: NotificationEventType): List<ManualNotificationRecentDispatch>
    fun insertPreview(clubId: UUID, hostMembershipId: UUID, selectionHash: String, expiresAt: OffsetDateTime): UUID
    fun findPreview(id: UUID, clubId: UUID, hostMembershipId: UUID): ManualNotificationPreviewRecord?
    fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch
}
```

- [ ] **Step 5: Add Flyway migration**

Create `V27__manual_notification_dispatch.sql`:

```sql
create table notification_manual_dispatch_previews (
  id char(36) not null,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  selection_hash char(64) not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key notification_manual_dispatch_previews_host_idx (club_id, host_membership_id, expires_at),
  constraint notification_manual_dispatch_previews_club_fk foreign key (club_id) references clubs(id),
  constraint notification_manual_dispatch_previews_host_fk foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint notification_manual_dispatch_previews_hash_check check (length(selection_hash) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table notification_manual_dispatches (
  id char(36) not null,
  club_id char(36) not null,
  event_id char(36) not null,
  session_id char(36) not null,
  event_type varchar(60) not null,
  requested_by_membership_id char(36) not null,
  requested_channels varchar(20) not null,
  audience varchar(40) not null,
  excluded_count int not null default 0,
  included_count int not null default 0,
  target_count int not null default 0,
  expected_in_app_count int not null default 0,
  expected_email_count int not null default 0,
  resend boolean not null default false,
  send_mode varchar(20) not null default 'NOW',
  scheduled_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key notification_manual_dispatches_event_uk (event_id),
  key notification_manual_dispatches_duplicate_idx (club_id, session_id, event_type, created_at),
  key notification_manual_dispatches_host_idx (club_id, requested_by_membership_id, created_at),
  constraint notification_manual_dispatches_event_fk foreign key (event_id, club_id) references notification_event_outbox(id, club_id),
  constraint notification_manual_dispatches_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint notification_manual_dispatches_host_fk foreign key (requested_by_membership_id, club_id) references memberships(id, club_id),
  constraint notification_manual_dispatches_requested_channels_check check (requested_channels in ('IN_APP', 'EMAIL', 'BOTH')),
  constraint notification_manual_dispatches_audience_check check (audience in ('ALL_ACTIVE_MEMBERS', 'SESSION_PARTICIPANTS', 'CONFIRMED_ATTENDEES')),
  constraint notification_manual_dispatches_send_mode_check check (send_mode in ('NOW')),
  constraint notification_manual_dispatches_counts_check check (
    excluded_count >= 0 and included_count >= 0 and target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest' --tests '*ServerArchitectureBoundaryTest'
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V27__manual_notification_dispatch.sql \
  server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt \
  server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt \
  server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt \
  server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt
git commit -m "feat: add manual notification dispatch contracts"
```

---

### Task 2: Manual Dispatch Application Service

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/NotificationApplicationException.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`

- [ ] **Step 1: Write failing service tests**

Create `HostManualNotificationServiceTest.kt` with these tests:

```kotlin
package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.ManualNotificationTemplateOption
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostManualNotificationServiceTest {
    private val now = OffsetDateTime.of(2026, 5, 13, 9, 0, 0, 0, ZoneOffset.UTC)

    @Test
    fun `options disables feedback template until document exists`() {
        val port = FakeManualPort(
            sessionContext = sessionContext(feedbackDocumentUploaded = false),
        )
        val service = service(port)

        val options = service.options(host(), SESSION_ID, PageRequest.cursor(null, null))

        val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
        assertThat(feedback.enabled).isFalse()
        assertThat(feedback.disabledReason).isEqualTo("피드백 문서를 먼저 등록해야 합니다.")
    }

    @Test
    fun `preview returns counts and duplicate warning`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)

        val preview = service.preview(host(), ManualNotificationPreviewCommand(selection()))

        assertThat(preview.audience.finalTargetCount).isEqualTo(3)
        assertThat(preview.channels.emailEligibleCount).isEqualTo(2)
        assertThat(preview.duplicates.requiresResendConfirmation).isTrue()
        assertThat(preview.warnings.map { it.code }).contains("EMAIL_PREFERENCE_SKIPS")
        assertThat(port.insertedPreviewHashes).hasSize(1)
    }

    @Test
    fun `confirm rejects duplicate without resend confirmation`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        assertThatThrownBy {
            service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))
        }
            .isInstanceOf(NotificationApplicationException::class.java)
            .extracting("error")
            .isEqualTo(NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH)
    }

    @Test
    fun `confirm writes manual dispatch when resend is confirmed`() {
        val port = FakeManualPort(recentDispatchCount = 1)
        val service = service(port)
        val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

        val result = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = true))

        assertThat(result.status).isEqualTo(NotificationEventOutboxStatus.PENDING)
        assertThat(result.summary.targetCount).isEqualTo(3)
        assertThat(port.insertedDispatches).hasSize(1)
        assertThat(port.insertedDispatches.single().manualDispatch!!.requestedChannels)
            .isEqualTo(ManualNotificationRequestedChannels.BOTH)
    }

    private fun service(port: ManualNotificationDispatchPort) =
        HostManualNotificationService(port, clock = { now })

    private fun host() = CurrentMember(
        userId = UUID.nameUUIDFromBytes("user".toByteArray()),
        membershipId = HOST_MEMBERSHIP_ID,
        clubId = CLUB_ID,
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "Host",
        accountName = "Host",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    private fun selection() = ManualNotificationSelection(
        sessionId = SESSION_ID,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        excludedMembershipIds = emptyList(),
        includedMembershipIds = emptyList(),
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun sessionContext(feedbackDocumentUploaded: Boolean = true) = ManualNotificationSessionContext(
        sessionId = SESSION_ID,
        clubId = CLUB_ID,
        sessionNumber = 7,
        bookTitle = "Example Book",
        state = "OPEN",
        visibility = "MEMBER",
        feedbackDocumentUploaded = feedbackDocumentUploaded,
    )

    private class FakeManualPort(
        private val sessionContext: ManualNotificationSessionContext = ManualNotificationSessionContext(
            sessionId = SESSION_ID,
            clubId = CLUB_ID,
            sessionNumber = 7,
            bookTitle = "Example Book",
            state = "OPEN",
            visibility = "MEMBER",
            feedbackDocumentUploaded = true,
        ),
        private val recentDispatchCount: Int = 0,
    ) : ManualNotificationDispatchPort {
        val insertedPreviewHashes = mutableListOf<String>()
        val insertedDispatches = mutableListOf<com.readmates.notification.application.model.NotificationEventPayload>()
        private val previews = mutableMapOf<UUID, ManualNotificationPreviewRecord>()

        override fun findSessionContext(clubId: UUID, sessionId: UUID) = sessionContext

        override fun listMembers(clubId: UUID, sessionId: UUID?, pageRequest: PageRequest) =
            CursorPage<com.readmates.notification.application.model.ManualNotificationMemberOption>(emptyList(), null)

        override fun previewTargets(clubId: UUID, selection: ManualNotificationSelection) =
            ManualNotificationTargetSnapshot(
                baseCount = 4,
                excludedCount = 1,
                includedCount = 0,
                finalTargetCount = 3,
                inAppEligibleCount = 3,
                emailEligibleCount = 2,
                emailSkippedByPreferenceCount = 1,
                emailMissingCount = 0,
            )

        override fun recentDispatches(clubId: UUID, sessionId: UUID, eventType: NotificationEventType) =
            (1..recentDispatchCount).map {
                com.readmates.notification.application.model.ManualNotificationRecentDispatch(
                    manualDispatchId = UUID.nameUUIDFromBytes("recent-$it".toByteArray()),
                    eventType = eventType,
                    requestedChannels = ManualNotificationRequestedChannels.BOTH,
                    createdAt = OffsetDateTime.of(2026, 5, 12, 9, 0, 0, 0, ZoneOffset.UTC),
                    requestedBy = "h***@example.com",
                    targetCount = 4,
                )
            }

        override fun insertPreview(clubId: UUID, hostMembershipId: UUID, selectionHash: String, expiresAt: OffsetDateTime): UUID {
            val id = UUID.nameUUIDFromBytes("preview-${insertedPreviewHashes.size}".toByteArray())
            insertedPreviewHashes += selectionHash
            previews[id] = ManualNotificationPreviewRecord(id, clubId, hostMembershipId, selectionHash, expiresAt)
            return id
        }

        override fun findPreview(id: UUID, clubId: UUID, hostMembershipId: UUID) = previews[id]

        override fun insertManualDispatch(
            clubId: UUID,
            hostMembershipId: UUID,
            selection: ManualNotificationSelection,
            payload: com.readmates.notification.application.model.NotificationEventPayload,
            targetSnapshot: ManualNotificationTargetSnapshot,
            resend: Boolean,
        ): ManualNotificationStoredDispatch {
            insertedDispatches += payload
            return ManualNotificationStoredDispatch(
                manualDispatchId = payload.manualDispatch!!.id,
                eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                createdAt = OffsetDateTime.of(2026, 5, 13, 9, 1, 0, 0, ZoneOffset.UTC),
            )
        }
    }

    private companion object {
        val CLUB_ID: UUID = UUID.nameUUIDFromBytes("club".toByteArray())
        val SESSION_ID: UUID = UUID.nameUUIDFromBytes("session".toByteArray())
        val HOST_MEMBERSHIP_ID: UUID = UUID.nameUUIDFromBytes("host".toByteArray())
    }
}
```

- [ ] **Step 2: Run service tests to verify they fail**

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
```

Expected: FAIL because `HostManualNotificationService` and new errors do not exist.

- [ ] **Step 3: Add manual notification errors**

Extend `NotificationApplicationError`:

```kotlin
enum class NotificationApplicationError {
    NOTIFICATION_NOT_FOUND,
    INVALID_TEST_MAIL_EMAIL,
    TEST_MAIL_COOLDOWN,
    MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE,
    MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
    DUPLICATE_NOTIFICATION_DISPATCH,
    MANUAL_NOTIFICATION_PREVIEW_EXPIRED,
    MEMBERSHIP_NOT_ALLOWED,
}
```

Update `NotificationErrorHandler.toHttpStatus()`:

```kotlin
private fun NotificationApplicationError.toHttpStatus(): HttpStatus =
    when (this) {
        NotificationApplicationError.NOTIFICATION_NOT_FOUND -> HttpStatus.NOT_FOUND
        NotificationApplicationError.INVALID_TEST_MAIL_EMAIL -> HttpStatus.BAD_REQUEST
        NotificationApplicationError.TEST_MAIL_COOLDOWN -> HttpStatus.TOO_MANY_REQUESTS
        NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE -> HttpStatus.CONFLICT
        NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY -> HttpStatus.UNPROCESSABLE_ENTITY
        NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH -> HttpStatus.CONFLICT
        NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED -> HttpStatus.CONFLICT
        NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED -> HttpStatus.FORBIDDEN
    }
```

- [ ] **Step 4: Implement `HostManualNotificationService`**

Create `HostManualNotificationService.kt`:

```kotlin
package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationAudiencePreview
import com.readmates.notification.application.model.ManualNotificationChannelPreview
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmResult
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationDuplicatePreview
import com.readmates.notification.application.model.ManualNotificationOptions
import com.readmates.notification.application.model.ManualNotificationPreview
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationTemplateOption
import com.readmates.notification.application.model.ManualNotificationTemplatePreview
import com.readmates.notification.application.model.ManualNotificationWarning
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.model.allowedManualAudiences
import com.readmates.notification.application.model.defaultManualAudience
import com.readmates.notification.application.port.`in`.ManageManualHostNotificationsUseCase
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class HostManualNotificationService(
    private val manualDispatchPort: ManualNotificationDispatchPort,
    private val clock: () -> OffsetDateTime = { OffsetDateTime.now(ZoneOffset.UTC) },
) : ManageManualHostNotificationsUseCase {
    override fun options(host: CurrentMember, sessionId: UUID?, pageRequest: PageRequest): ManualNotificationOptions {
        val currentHost = requireHost(host)
        val session = sessionId?.let {
            manualDispatchPort.findSessionContext(currentHost.clubId, it) ?: throw notFound()
        }
        val templates = manualTemplates.map { eventType ->
            val disabledReason = session?.let { disabledReason(eventType, it.state, it.visibility, it.feedbackDocumentUploaded) }
            ManualNotificationTemplateOption(
                eventType = eventType,
                label = manualTemplateLabel(eventType),
                enabled = disabledReason == null,
                disabledReason = disabledReason,
                defaultAudience = defaultManualAudience(eventType),
                allowedAudiences = allowedManualAudiences(eventType),
            )
        }
        val members = manualDispatchPort.listMembers(currentHost.clubId, sessionId, pageRequest)
        return ManualNotificationOptions(templates = templates, members = members.items, nextCursor = members.nextCursor)
    }

    override fun preview(host: CurrentMember, command: ManualNotificationPreviewCommand): ManualNotificationPreview {
        val currentHost = requireHost(host)
        validateSelection(currentHost, command.selection)
        val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
        if (targetSnapshot.finalTargetCount <= 0) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
                "Manual notification target audience is empty",
            )
        }
        val recent = manualDispatchPort.recentDispatches(
            currentHost.clubId,
            command.selection.sessionId,
            command.selection.eventType,
        )
        val expiresAt = clock().plusMinutes(PREVIEW_TTL_MINUTES)
        val previewId = manualDispatchPort.insertPreview(
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            selectionHash = selectionHash(command.selection),
            expiresAt = expiresAt,
        )
        return ManualNotificationPreview(
            previewId = previewId,
            expiresAt = expiresAt,
            template = templatePreview(command.selection.eventType),
            audience = ManualNotificationAudiencePreview(
                baseGroup = command.selection.audience,
                baseCount = targetSnapshot.baseCount,
                excludedCount = targetSnapshot.excludedCount,
                includedCount = targetSnapshot.includedCount,
                finalTargetCount = targetSnapshot.finalTargetCount,
            ),
            channels = ManualNotificationChannelPreview(
                requested = command.selection.requestedChannels,
                inAppEligibleCount = targetSnapshot.inAppEligibleCount,
                emailEligibleCount = targetSnapshot.emailEligibleCount,
                emailSkippedByPreferenceCount = targetSnapshot.emailSkippedByPreferenceCount,
                emailMissingCount = targetSnapshot.emailMissingCount,
            ),
            duplicates = ManualNotificationDuplicatePreview(
                requiresResendConfirmation = recent.isNotEmpty(),
                recentDispatches = recent,
            ),
            warnings = warningsFor(targetSnapshot),
        )
    }

    override fun confirm(host: CurrentMember, command: ManualNotificationConfirmCommand): ManualNotificationConfirmResult {
        val currentHost = requireHost(host)
        validateSelection(currentHost, command.selection)
        val preview = manualDispatchPort.findPreview(command.previewId, currentHost.clubId, currentHost.membershipId)
            ?: throw previewExpired()
        if (preview.expiresAt.isBefore(clock()) || preview.selectionHash != selectionHash(command.selection)) {
            throw previewExpired()
        }
        val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
        if (targetSnapshot.finalTargetCount <= 0) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
                "Manual notification target audience is empty",
            )
        }
        val recent = manualDispatchPort.recentDispatches(
            currentHost.clubId,
            command.selection.sessionId,
            command.selection.eventType,
        )
        if (recent.isNotEmpty() && !command.resendConfirmed) {
            throw NotificationApplicationException(
                NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH,
                "Manual notification dispatch already exists for session/template",
            )
        }
        val dispatchId = UUID.randomUUID()
        val session = manualDispatchPort.findSessionContext(currentHost.clubId, command.selection.sessionId) ?: throw notFound()
        val payload = NotificationEventPayload(
            sessionId = command.selection.sessionId,
            sessionNumber = session.sessionNumber,
            bookTitle = session.bookTitle,
            manualDispatch = NotificationManualDispatchPayload(
                id = dispatchId,
                source = NotificationDispatchSource.MANUAL,
                requestedByMembershipId = currentHost.membershipId,
                requestedChannels = command.selection.requestedChannels,
                audience = command.selection.audience,
                excludedMembershipIds = command.selection.excludedMembershipIds,
                includedMembershipIds = command.selection.includedMembershipIds,
                resend = recent.isNotEmpty(),
                sendMode = command.selection.sendMode,
            ),
        )
        val stored = manualDispatchPort.insertManualDispatch(
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            selection = command.selection,
            payload = payload,
            targetSnapshot = targetSnapshot,
            resend = recent.isNotEmpty(),
        )
        return ManualNotificationConfirmResult(
            manualDispatchId = stored.manualDispatchId,
            eventId = stored.eventId,
            status = NotificationEventOutboxStatus.PENDING,
            createdAt = stored.createdAt,
            summary = ManualNotificationConfirmSummary(
                targetCount = targetSnapshot.finalTargetCount,
                requestedChannels = command.selection.requestedChannels,
                expectedInAppCount = targetSnapshot.inAppEligibleCount,
                expectedEmailCount = targetSnapshot.emailEligibleCount,
            ),
        )
    }

    private fun validateSelection(host: CurrentMember, selection: ManualNotificationSelection) {
        if (selection.eventType !in manualTemplates || selection.audience !in allowedManualAudiences(selection.eventType)) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE,
                "Manual notification template is unavailable",
            )
        }
        val session = manualDispatchPort.findSessionContext(host.clubId, selection.sessionId) ?: throw notFound()
        disabledReason(selection.eventType, session.state, session.visibility, session.feedbackDocumentUploaded)?.let {
            throw NotificationApplicationException(NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE, it)
        }
    }

    private fun disabledReason(eventType: NotificationEventType, state: String, visibility: String, feedbackDocumentUploaded: Boolean): String? =
        when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED ->
                if (visibility !in setOf("MEMBER", "PUBLIC")) "멤버에게 보이는 세션만 발송할 수 있습니다." else null
            NotificationEventType.SESSION_REMINDER_DUE ->
                if (state !in setOf("DRAFT", "OPEN")) "예정 또는 열린 세션만 리마인더를 보낼 수 있습니다." else null
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
                if (!feedbackDocumentUploaded) "피드백 문서를 먼저 등록해야 합니다." else null
            NotificationEventType.REVIEW_PUBLISHED -> "서평 공개 알림은 수동 발송하지 않습니다."
        }

    private fun templatePreview(eventType: NotificationEventType): ManualNotificationTemplatePreview =
        ManualNotificationTemplatePreview(
            eventType = eventType,
            label = manualTemplateLabel(eventType),
            subject = manualTemplateLabel(eventType),
            bodyPreview = when (eventType) {
                NotificationEventType.NEXT_BOOK_PUBLISHED -> "다음 모임에서 함께 읽을 책을 확인해 주세요."
                NotificationEventType.SESSION_REMINDER_DUE -> "모임 전 질문과 읽은 분량, 참석 상태를 확인해 주세요."
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "참석한 회차의 피드백 문서를 확인해 주세요."
                NotificationEventType.REVIEW_PUBLISHED -> "새 서평을 확인해 주세요."
            },
        )

    private fun warningsFor(snapshot: com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot): List<ManualNotificationWarning> =
        buildList {
            if (snapshot.emailSkippedByPreferenceCount > 0) {
                add(ManualNotificationWarning("EMAIL_PREFERENCE_SKIPS", "이메일 알림 설정 때문에 ${snapshot.emailSkippedByPreferenceCount}명에게는 이메일이 가지 않습니다."))
            }
            if (snapshot.emailMissingCount > 0) {
                add(ManualNotificationWarning("EMAIL_MISSING", "이메일 주소가 없어 ${snapshot.emailMissingCount}명에게는 이메일이 가지 않습니다."))
            }
        }

    private fun manualTemplateLabel(eventType: NotificationEventType): String =
        when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> "다음 책 공개"
            NotificationEventType.SESSION_REMINDER_DUE -> "모임 전날 리마인더"
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "피드백 문서 등록"
            NotificationEventType.REVIEW_PUBLISHED -> "서평 공개"
        }

    private fun selectionHash(selection: ManualNotificationSelection): String {
        val raw = listOf(
            selection.sessionId,
            selection.eventType,
            selection.audience,
            selection.requestedChannels,
            selection.excludedMembershipIds.sorted(),
            selection.includedMembershipIds.sorted(),
            selection.sendMode,
        ).joinToString("|")
        return MessageDigest.getInstance("SHA-256")
            .digest(raw.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun notFound(): NotificationApplicationException =
        NotificationApplicationException(NotificationApplicationError.NOTIFICATION_NOT_FOUND, "Manual notification context not found")

    private fun previewExpired(): NotificationApplicationException =
        NotificationApplicationException(NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED, "Manual notification preview expired")

    private companion object {
        private const val PREVIEW_TTL_MINUTES = 10L
        private val manualTemplates = listOf(
            NotificationEventType.NEXT_BOOK_PUBLISHED,
            NotificationEventType.SESSION_REMINDER_DUE,
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        )
    }
}
```

- [ ] **Step 5: Run service tests**

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt \
  server/src/main/kotlin/com/readmates/notification/application/NotificationApplicationException.kt \
  server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt \
  server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt
git commit -m "feat: add manual notification service"
```

---

### Task 3: JDBC Manual Dispatch Adapter

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Write failing persistence tests**

Create `JdbcManualNotificationDispatchAdapterTest.kt`:

```kotlin
package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val CLEANUP_MANUAL_DISPATCH_SQL = """
    delete from notification_manual_dispatches where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_manual_dispatch_previews where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries where club_id = '00000000-0000-0000-0000-000000000001';
    delete from member_notifications where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox where dedupe_key like 'manual-dispatch-test-%';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class JdbcManualNotificationDispatchAdapterTest(
    @param:Autowired private val adapter: JdbcManualNotificationDispatchAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `findSessionContext returns session metadata and feedback document state`() {
        val context = adapter.findSessionContext(clubId, sessionId)

        assertThat(context).isNotNull
        assertThat(context!!.sessionNumber).isGreaterThan(0)
        assertThat(context.bookTitle).isNotBlank()
    }

    @Test
    fun `previewTargets applies audience edits and email preference counts`() {
        disablePreference("member1@example.com")
        val selection = selection(
            excludedMembershipIds = listOf(membershipId("member2@example.com")),
            includedMembershipIds = emptyList(),
        )

        val snapshot = adapter.previewTargets(clubId, selection)

        assertThat(snapshot.finalTargetCount).isGreaterThan(0)
        assertThat(snapshot.excludedCount).isEqualTo(1)
        assertThat(snapshot.emailSkippedByPreferenceCount).isGreaterThanOrEqualTo(1)
    }

    @Test
    fun `insertPreview and findPreview round trip host scoped preview`() {
        val expiresAt = OffsetDateTime.of(2026, 5, 13, 9, 10, 0, 0, ZoneOffset.UTC)

        val id = adapter.insertPreview(clubId, hostMembershipId, "a".repeat(64), expiresAt)
        val record = adapter.findPreview(id, clubId, hostMembershipId)

        assertThat(record!!.selectionHash).isEqualTo("a".repeat(64))
        assertThat(record.expiresAt).isEqualTo(expiresAt)
    }

    @Test
    fun `insertManualDispatch writes event outbox and audit row`() {
        val dispatchId = UUID.nameUUIDFromBytes("manual-dispatch".toByteArray())
        val payload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "Example Book",
            manualDispatch = NotificationManualDispatchPayload(
                id = dispatchId,
                source = NotificationDispatchSource.MANUAL,
                requestedByMembershipId = hostMembershipId,
                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                resend = true,
                sendMode = ManualNotificationSendMode.NOW,
            ),
        )

        val stored = adapter.insertManualDispatch(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selection = selection(),
            payload = payload,
            targetSnapshot = ManualNotificationTargetSnapshot(3, 0, 0, 3, 3, 2, 1, 0),
            resend = true,
        )

        assertThat(stored.manualDispatchId).isEqualTo(dispatchId)
        assertThat(eventCount(stored.eventId)).isEqualTo(1)
        assertThat(manualDispatchCount(dispatchId)).isEqualTo(1)
    }

    private fun selection(
        excludedMembershipIds: List<UUID> = emptyList(),
        includedMembershipIds: List<UUID> = emptyList(),
    ) = ManualNotificationSelection(
        sessionId = sessionId,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        excludedMembershipIds = excludedMembershipIds,
        includedMembershipIds = includedMembershipIds,
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun disablePreference(email: String) {
        val membershipId = membershipId(email)
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, email_enabled, session_reminder_due_enabled)
            values (?, ?, false, false)
            on duplicate key update email_enabled = false, session_reminder_due_enabled = false
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
        )
    }

    private fun membershipId(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = ?
                  and users.email = ?
                """.trimIndent(),
                String::class.java,
                clubId.toString(),
                email,
            )!!,
        )

    private fun eventCount(eventId: UUID): Int =
        jdbcTemplate.queryForObject("select count(*) from notification_event_outbox where id = ?", Int::class.java, eventId.toString()) ?: 0

    private fun manualDispatchCount(dispatchId: UUID): Int =
        jdbcTemplate.queryForObject("select count(*) from notification_manual_dispatches where id = ?", Int::class.java, dispatchId.toString()) ?: 0

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [ ] **Step 2: Run persistence test to verify it fails**

```bash
./server/gradlew -p server test --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: FAIL because `JdbcManualNotificationDispatchAdapter` does not exist.

- [ ] **Step 3: Implement adapter**

Create `JdbcManualNotificationDispatchAdapter.kt`. Keep helper methods small and avoid exposing raw email:

```kotlin
package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationEligibility
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcManualNotificationDispatchAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    @param:Value("\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}") private val eventsTopic: String,
) : ManualNotificationDispatchPort {
    override fun findSessionContext(clubId: UUID, sessionId: UUID): ManualNotificationSessionContext? =
        jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.club_id,
              sessions.number,
              sessions.book_title,
              sessions.state,
              sessions.visibility,
              exists(
                select 1
                from feedback_documents
                where feedback_documents.club_id = sessions.club_id
                  and feedback_documents.session_id = sessions.id
              ) as feedback_document_uploaded
            from sessions
            where sessions.club_id = ?
              and sessions.id = ?
            """.trimIndent(),
            { rs, _ -> rs.toSessionContext() },
            clubId.dbString(),
            sessionId.dbString(),
        ).firstOrNull()

    override fun listMembers(clubId: UUID, sessionId: UUID?, pageRequest: PageRequest): CursorPage<ManualNotificationMemberOption> {
        val cursor = pageRequest.cursor["displayName"]
        val args = mutableListOf<Any>(clubId.dbString())
        val sessionJoin = if (sessionId == null) {
            "left join session_participants on false"
        } else {
            args += sessionId.dbString()
            """
            left join session_participants on session_participants.club_id = memberships.club_id
              and session_participants.session_id = ?
              and session_participants.membership_id = memberships.id
            """.trimIndent()
        }
        val cursorPredicate = if (cursor.isNullOrBlank()) "" else "and coalesce(memberships.short_name, users.name) > ?"
        if (!cursor.isNullOrBlank()) args += cursor
        args += pageRequest.limit + 1
        val rows = jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              users.email,
              memberships.role,
              memberships.status,
              session_participants.participation_status,
              session_participants.attendance_status,
              coalesce(notification_preferences.email_enabled, true) as email_enabled
            from memberships
            join users on users.id = memberships.user_id
            $sessionJoin
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
              $cursorPredicate
            order by display_name, memberships.id
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toMemberOption() },
            *args.toTypedArray(),
        )
        val visible = rows.take(pageRequest.limit)
        return CursorPage(
            items = visible,
            nextCursor = if (rows.size > pageRequest.limit) {
                CursorCodec.encode(mapOf("displayName" to visible.last().displayName))
            } else {
                null
            },
        )
    }

    override fun previewTargets(clubId: UUID, selection: ManualNotificationSelection): ManualNotificationTargetSnapshot {
        val baseIds = baseMembershipIds(clubId, selection)
        val includedIds = eligibleIncludedIds(clubId, selection)
        val finalIds = (baseIds - selection.excludedMembershipIds.toSet() + includedIds).toList()
        if (finalIds.isEmpty()) {
            return ManualNotificationTargetSnapshot(baseIds.size, selection.excludedMembershipIds.size, includedIds.size, 0, 0, 0, 0, 0)
        }
        val eligibility = emailEligibilityCounts(clubId, selection.eventType, finalIds)
        return ManualNotificationTargetSnapshot(
            baseCount = baseIds.size,
            excludedCount = selection.excludedMembershipIds.count { it in baseIds },
            includedCount = includedIds.size,
            finalTargetCount = finalIds.size,
            inAppEligibleCount = if (selection.requestedChannels.name != "EMAIL") finalIds.size else 0,
            emailEligibleCount = if (selection.requestedChannels.name != "IN_APP") eligibility.eligible else 0,
            emailSkippedByPreferenceCount = if (selection.requestedChannels.name != "IN_APP") eligibility.preferenceSkipped else 0,
            emailMissingCount = if (selection.requestedChannels.name != "IN_APP") eligibility.missing else 0,
        )
    }

    override fun recentDispatches(clubId: UUID, sessionId: UUID, eventType: NotificationEventType) =
        jdbcTemplate.query(
            """
            select
              notification_manual_dispatches.id,
              notification_manual_dispatches.event_type,
              notification_manual_dispatches.requested_channels,
              notification_manual_dispatches.created_at,
              users.email as requested_by_email,
              notification_manual_dispatches.target_count
            from notification_manual_dispatches
            join memberships on memberships.id = notification_manual_dispatches.requested_by_membership_id
              and memberships.club_id = notification_manual_dispatches.club_id
            join users on users.id = memberships.user_id
            where notification_manual_dispatches.club_id = ?
              and notification_manual_dispatches.session_id = ?
              and notification_manual_dispatches.event_type = ?
            order by notification_manual_dispatches.created_at desc
            limit 5
            """.trimIndent(),
            { rs, _ -> rs.toRecentDispatch() },
            clubId.dbString(),
            sessionId.dbString(),
            eventType.name,
        )

    override fun insertPreview(clubId: UUID, hostMembershipId: UUID, selectionHash: String, expiresAt: OffsetDateTime): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatch_previews (id, club_id, host_membership_id, selection_hash, expires_at)
            values (?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
            selectionHash,
            expiresAt.toUtcLocalDateTime(),
        )
        return id
    }

    override fun findPreview(id: UUID, clubId: UUID, hostMembershipId: UUID): ManualNotificationPreviewRecord? =
        jdbcTemplate.query(
            """
            select id, club_id, host_membership_id, selection_hash, expires_at
            from notification_manual_dispatch_previews
            where id = ?
              and club_id = ?
              and host_membership_id = ?
            """.trimIndent(),
            { rs, _ -> ManualNotificationPreviewRecord(rs.uuid("id"), rs.uuid("club_id"), rs.uuid("host_membership_id"), rs.getString("selection_hash"), rs.utcOffsetDateTime("expires_at")) },
            id.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
        ).firstOrNull()

    @Transactional
    override fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch {
        val eventId = UUID.randomUUID()
        val dispatchId = requireNotNull(payload.manualDispatch?.id) { "Manual dispatch payload id is required" }
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_topic, kafka_key, status, dedupe_key
            )
            values (?, ?, ?, 'SESSION', ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            eventId.dbString(),
            clubId.dbString(),
            selection.eventType.name,
            selection.sessionId.dbString(),
            objectMapper.writeValueAsString(payload),
            eventsTopic,
            clubId.dbString(),
            "manual:${selection.eventType}:${selection.sessionId}:$dispatchId",
        )
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, excluded_count, included_count, target_count,
              expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            dispatchId.dbString(),
            clubId.dbString(),
            eventId.dbString(),
            selection.sessionId.dbString(),
            selection.eventType.name,
            hostMembershipId.dbString(),
            selection.requestedChannels.name,
            selection.audience.name,
            targetSnapshot.excludedCount,
            targetSnapshot.includedCount,
            targetSnapshot.finalTargetCount,
            targetSnapshot.inAppEligibleCount,
            targetSnapshot.emailEligibleCount,
            resend,
            selection.sendMode.name,
        )
        val createdAt = jdbcTemplate.queryForObject(
            "select created_at from notification_manual_dispatches where id = ?",
            { rs, _ -> rs.utcOffsetDateTime("created_at") },
            dispatchId.dbString(),
        )!!
        return ManualNotificationStoredDispatch(dispatchId, eventId, createdAt)
    }

    private fun baseMembershipIds(clubId: UUID, selection: ManualNotificationSelection): Set<UUID> {
        val sql = when (selection.audience) {
            ManualNotificationAudience.ALL_ACTIVE_MEMBERS -> """
                select memberships.id
                from memberships
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
            ManualNotificationAudience.SESSION_PARTICIPANTS -> """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
            ManualNotificationAudience.CONFIRMED_ATTENDEES -> """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                  and session_participants.attendance_status = 'ATTENDED'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
        }.trimIndent()
        val args = if (selection.audience == ManualNotificationAudience.ALL_ACTIVE_MEMBERS) {
            arrayOf(clubId.dbString())
        } else {
            arrayOf(selection.sessionId.dbString(), clubId.dbString())
        }
        return jdbcTemplate.query(sql, { rs, _ -> rs.uuid("id") }, *args).toSet()
    }

    private fun eligibleIncludedIds(clubId: UUID, selection: ManualNotificationSelection): Set<UUID> {
        if (selection.includedMembershipIds.isEmpty()) return emptySet()
        val placeholders = selection.includedMembershipIds.joinToString(",") { "?" }
        return jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ?
              and status = 'ACTIVE'
              and id in ($placeholders)
            """.trimIndent(),
            { rs, _ -> rs.uuid("id") },
            *(listOf(clubId.dbString() as Any) + selection.includedMembershipIds.map { it.dbString() as Any }).toTypedArray(),
        ).toSet()
    }

    private fun emailEligibilityCounts(clubId: UUID, eventType: NotificationEventType, membershipIds: List<UUID>): EmailCounts {
        val preferenceColumn = when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
            NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
            NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
        }
        val placeholders = membershipIds.joinToString(",") { "?" }
        val row = jdbcTemplate.queryForMap(
            """
            select
              sum(case when users.email is not null and users.email <> '' and coalesce(notification_preferences.email_enabled, true) and coalesce(notification_preferences.$preferenceColumn, true) then 1 else 0 end) as eligible,
              sum(case when users.email is not null and users.email <> '' and not (coalesce(notification_preferences.email_enabled, true) and coalesce(notification_preferences.$preferenceColumn, true)) then 1 else 0 end) as preference_skipped,
              sum(case when users.email is null or users.email = '' then 1 else 0 end) as missing
            from memberships
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and memberships.id in ($placeholders)
            """.trimIndent(),
            *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
        )
        return EmailCounts(
            eligible = (row["eligible"] as Number?)?.toInt() ?: 0,
            preferenceSkipped = (row["preference_skipped"] as Number?)?.toInt() ?: 0,
            missing = (row["missing"] as Number?)?.toInt() ?: 0,
        )
    }

    private fun ResultSet.toSessionContext(): ManualNotificationSessionContext =
        ManualNotificationSessionContext(
            sessionId = uuid("id"),
            clubId = uuid("club_id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            state = getString("state"),
            visibility = getString("visibility"),
            feedbackDocumentUploaded = getBoolean("feedback_document_uploaded"),
        )

    private fun ResultSet.toMemberOption(): ManualNotificationMemberOption {
        val email = getString("email")
        val emailEnabled = getBoolean("email_enabled")
        return ManualNotificationMemberOption(
            membershipId = uuid("membership_id"),
            displayName = getString("display_name"),
            maskedEmail = maskEmail(email),
            role = getString("role"),
            membershipStatus = getString("status"),
            sessionParticipationStatus = getString("participation_status"),
            attendanceStatus = getString("attendance_status"),
            emailEligibility = when {
                email.isNullOrBlank() -> ManualNotificationEligibility.EMAIL_MISSING
                !emailEnabled -> ManualNotificationEligibility.EMAIL_DISABLED
                else -> ManualNotificationEligibility.ELIGIBLE
            },
            inAppEligibility = ManualNotificationEligibility.ELIGIBLE,
        )
    }

    private fun ResultSet.toRecentDispatch() =
        com.readmates.notification.application.model.ManualNotificationRecentDispatch(
            manualDispatchId = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            requestedChannels = com.readmates.notification.application.model.ManualNotificationRequestedChannels.valueOf(getString("requested_channels")),
            createdAt = utcOffsetDateTime("created_at"),
            requestedBy = maskEmail(getString("requested_by_email")),
            targetCount = getInt("target_count"),
        )

    private fun maskEmail(email: String?): String {
        val value = email?.trim().orEmpty()
        val at = value.indexOf('@')
        if (at <= 0 || at == value.lastIndex) return "숨김"
        return "${value.first()}***@${value.substring(at + 1)}"
    }

    private data class EmailCounts(val eligible: Int, val preferenceSkipped: Int, val missing: Int)
}
```

- [ ] **Step 4: Run persistence tests**

```bash
./server/gradlew -p server test --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS. If fixture feedback document table name differs, update only the `exists` subquery in `findSessionContext` after checking `JdbcFeedbackDocumentStoreAdapter`.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt \
  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt
git commit -m "feat: persist manual notification dispatches"
```

---

### Task 4: Manual Delivery Planning

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`

- [ ] **Step 1: Add failing delivery planning test**

Append to `JdbcNotificationDeliveryAdapterTest`:

```kotlin
@Test
fun `manual dispatch planning respects requested channels and target edits`() {
    val manualEventId = UUID.nameUUIDFromBytes("manual-event".toByteArray())
    val member1 = membershipIdForEmail("member1@example.com")
    val member2 = membershipIdForEmail("member2@example.com")
    insertManualEventOutboxRow(
        eventId = manualEventId,
        requestedChannels = "IN_APP",
        audience = "ALL_ACTIVE_MEMBERS",
        excludedMembershipIds = listOf(member2),
    )

    val deliveries = deliveryAdapter.persistPlannedDeliveries(
        message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
    )

    assertThat(deliveries).allSatisfy { assertThat(it.channel).isEqualTo(NotificationChannel.IN_APP) }
    assertThat(deliveries.map { it.recipientMembershipId }).contains(member1)
    assertThat(deliveries.map { it.recipientMembershipId }).doesNotContain(member2)
    assertThat(memberNotificationRows(manualEventId)).isEqualTo(deliveries.size)
}
```

Add helper in the same test class:

```kotlin
private fun insertManualEventOutboxRow(
    eventId: UUID,
    requestedChannels: String,
    audience: String,
    excludedMembershipIds: List<UUID> = emptyList(),
    includedMembershipIds: List<UUID> = emptyList(),
) {
    val manualDispatchId = UUID.nameUUIDFromBytes("manual-dispatch-$eventId".toByteArray())
    val excludedJson = excludedMembershipIds.joinToString(prefix = "[", postfix = "]") { "\"$it\"" }
    val includedJson = includedMembershipIds.joinToString(prefix = "[", postfix = "]") { "\"$it\"" }
    jdbcTemplate.update(
        """
        insert into notification_event_outbox (
          id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status, kafka_topic, kafka_key, dedupe_key
        ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object(
          'sessionId', ?,
          'sessionNumber', 1,
          'bookTitle', '팩트풀니스',
          'manualDispatch', json_object(
            'id', ?,
            'source', 'MANUAL',
            'requestedByMembershipId', '00000000-0000-0000-0000-000000000201',
            'requestedChannels', ?,
            'audience', ?,
            'excludedMembershipIds', cast(? as json),
            'includedMembershipIds', cast(? as json),
            'resend', false,
            'sendMode', 'NOW'
          )
        ), 'PUBLISHED', 'readmates.notification.events.v1', ?, ?)
        """.trimIndent(),
        eventId.toString(),
        clubId.toString(),
        sessionId.toString(),
        sessionId.toString(),
        manualDispatchId.toString(),
        requestedChannels,
        audience,
        excludedJson,
        includedJson,
        clubId.toString(),
        "delivery-adapter-test-manual-$eventId",
    )
}
```

- [ ] **Step 2: Run delivery adapter test to verify failure**

```bash
./server/gradlew -p server test --tests '*JdbcNotificationDeliveryAdapterTest.manual dispatch planning respects requested channels and target edits'
```

Expected: FAIL because manual metadata is ignored and email deliveries are still planned.

- [ ] **Step 3: Make Jackson payload mapping handle manual metadata**

`NotificationEventPayload` already contains `manualDispatch` from Task 1. In `NotificationDeliveryPlanningOperations.persistPlannedDeliveries`, change rows creation from unconditional two-channel rows to a helper:

```kotlin
val rows = recipients.flatMap { recipient ->
    deliveryRowsForRecipient(persistedMessage, recipient)
}
```

Add helper:

```kotlin
private fun deliveryRowsForRecipient(
    message: NotificationEventMessage,
    recipient: DeliveryRecipient,
): List<DeliveryInsertRow> {
    val requested = message.payload.manualDispatch?.requestedChannels
    val includeInApp = requested == null || requested.name == "IN_APP" || requested.name == "BOTH"
    val includeEmail = requested == null || requested.name == "EMAIL" || requested.name == "BOTH"
    return buildList {
        if (includeInApp) {
            add(
                DeliveryInsertRow(
                    id = UUID.randomUUID(),
                    recipient = recipient,
                    channel = NotificationChannel.IN_APP,
                    status = NotificationDeliveryStatus.SENT,
                    skipReason = null,
                ),
            )
        }
        if (includeEmail) {
            add(
                DeliveryInsertRow(
                    id = UUID.randomUUID(),
                    recipient = recipient,
                    channel = NotificationChannel.EMAIL,
                    status = if (recipient.emailAllowed) NotificationDeliveryStatus.PENDING else NotificationDeliveryStatus.SKIPPED,
                    skipReason = if (recipient.emailAllowed) null else SKIP_REASON_EMAIL_DISABLED,
                ),
            )
        }
    }
}
```

- [ ] **Step 4: Add manual recipient resolver branch**

In `recipientsFor`, branch before event type:

```kotlin
private fun recipientsFor(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<DeliveryRecipient> =
    message.payload.manualDispatch?.let { manualRecipients(jdbcTemplate, message) } ?: when (message.eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED ->
            sessionViewerRecipients(jdbcTemplate, message, "next_book_published_enabled", "sessions.state = 'DRAFT'")
        NotificationEventType.SESSION_REMINDER_DUE ->
            sessionViewerRecipients(jdbcTemplate, message, "session_reminder_due_enabled", "sessions.state in ('DRAFT', 'OPEN')")
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
            feedbackRecipients(jdbcTemplate, message)
        NotificationEventType.REVIEW_PUBLISHED ->
            reviewRecipients(jdbcTemplate, message)
    }
```

Add `manualRecipients` using existing automatic eligibility rules and target edits:

```kotlin
private fun manualRecipients(
    jdbcTemplate: JdbcTemplate,
    message: NotificationEventMessage,
): List<DeliveryRecipient> {
    val manual = requireNotNull(message.payload.manualDispatch)
    val baseIds = manualBaseMembershipIds(jdbcTemplate, message)
    val includedIds = activeMembershipIds(jdbcTemplate, message.clubId, manual.includedMembershipIds)
    val finalIds = (baseIds - manual.excludedMembershipIds.toSet() + includedIds).toList()
    if (finalIds.isEmpty()) {
        return emptyList()
    }
    val placeholders = finalIds.joinToString(",") { "?" }
    val preferenceColumn = when (message.eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
        NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
        NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
    }
    return jdbcTemplate.query(
        """
        select
          memberships.id as recipient_membership_id,
          coalesce(memberships.short_name, users.name) as display_name,
          (
            users.email is not null
            and users.email <> ''
            and coalesce(notification_preferences.email_enabled, true)
            and coalesce(notification_preferences.$preferenceColumn, true)
          ) as email_allowed
        from memberships
        join users on users.id = memberships.user_id
        left join notification_preferences on notification_preferences.membership_id = memberships.id
          and notification_preferences.club_id = memberships.club_id
        where memberships.club_id = ?
          and memberships.status = 'ACTIVE'
          and memberships.id in ($placeholders)
        """.trimIndent(),
        { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
        *(listOf(message.clubId.dbString() as Any) + finalIds.map { it.dbString() as Any }).toTypedArray(),
    )
}
```

Add helper methods matching the SQL from `JdbcManualNotificationDispatchAdapter`:

```kotlin
private fun manualBaseMembershipIds(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): Set<UUID> {
    val manual = requireNotNull(message.payload.manualDispatch)
    val sessionId = rowMappers.sessionId(message)
    val sql = when (manual.audience.name) {
        "ALL_ACTIVE_MEMBERS" -> """
            select memberships.id
            from memberships
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
        """
        "SESSION_PARTICIPANTS" -> """
            select memberships.id
            from memberships
            join session_participants on session_participants.membership_id = memberships.id
              and session_participants.club_id = memberships.club_id
              and session_participants.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
        """
        "CONFIRMED_ATTENDEES" -> """
            select memberships.id
            from memberships
            join session_participants on session_participants.membership_id = memberships.id
              and session_participants.club_id = memberships.club_id
              and session_participants.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
              and session_participants.attendance_status = 'ATTENDED'
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
        """
        else -> return emptySet()
    }.trimIndent()
    val args = if (manual.audience.name == "ALL_ACTIVE_MEMBERS") {
        arrayOf(message.clubId.dbString())
    } else {
        arrayOf(sessionId.dbString(), message.clubId.dbString())
    }
    return jdbcTemplate.query(sql, { rs, _ -> rs.uuid("id") }, *args).toSet()
}

private fun activeMembershipIds(jdbcTemplate: JdbcTemplate, clubId: UUID, membershipIds: List<UUID>): Set<UUID> {
    if (membershipIds.isEmpty()) return emptySet()
    val placeholders = membershipIds.joinToString(",") { "?" }
    return jdbcTemplate.query(
        """
        select id
        from memberships
        where club_id = ?
          and status = 'ACTIVE'
          and id in ($placeholders)
        """.trimIndent(),
        { rs, _ -> rs.uuid("id") },
        *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
    ).toSet()
}
```

- [ ] **Step 5: Run focused delivery tests**

```bash
./server/gradlew -p server test --tests '*JdbcNotificationDeliveryAdapterTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt \
  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt \
  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt
git commit -m "feat: plan manual notification deliveries"
```

---

### Task 5: Host Manual Notification API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [ ] **Step 1: Write failing controller tests**

Append to `HostNotificationControllerTest`:

```kotlin
@Test
fun `host previews manual reminder without exposing raw email`() {
    val response = mockMvc.post("/api/host/notifications/manual/preview") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """
          {
            "sessionId": "00000000-0000-0000-0000-000000000301",
            "eventType": "SESSION_REMINDER_DUE",
            "audience": "ALL_ACTIVE_MEMBERS",
            "requestedChannels": "BOTH",
            "excludedMembershipIds": [],
            "includedMembershipIds": [],
            "sendMode": "NOW"
          }
        """.trimIndent()
    }.andExpect {
        status { isOk() }
        jsonPath("$.template.eventType") { value("SESSION_REMINDER_DUE") }
        jsonPath("$.audience.finalTargetCount") { exists() }
        jsonPath("$.channels.requested") { value("BOTH") }
    }.andReturn().response.contentAsString

    assertThat(response).doesNotContain("member@example.com")
    assertThat(response).doesNotContain("host@example.com")
}

@Test
fun `host confirms manual reminder after preview`() {
    val previewId = mockMvc.post("/api/host/notifications/manual/preview") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """
          {
            "sessionId": "00000000-0000-0000-0000-000000000301",
            "eventType": "SESSION_REMINDER_DUE",
            "audience": "ALL_ACTIVE_MEMBERS",
            "requestedChannels": "IN_APP",
            "excludedMembershipIds": [],
            "includedMembershipIds": [],
            "sendMode": "NOW"
          }
        """.trimIndent()
    }.andReturn().response.contentAsString
        .let { tools.jackson.databind.ObjectMapper().readTree(it).get("previewId").asText() }

    mockMvc.post("/api/host/notifications/manual") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """
          {
            "previewId": "$previewId",
            "sessionId": "00000000-0000-0000-0000-000000000301",
            "eventType": "SESSION_REMINDER_DUE",
            "audience": "ALL_ACTIVE_MEMBERS",
            "requestedChannels": "IN_APP",
            "excludedMembershipIds": [],
            "includedMembershipIds": [],
            "sendMode": "NOW",
            "resendConfirmed": false
          }
        """.trimIndent()
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("PENDING") }
        jsonPath("$.summary.requestedChannels") { value("IN_APP") }
    }
}
```

- [ ] **Step 2: Run controller tests to verify failure**

```bash
./server/gradlew -p server test --tests '*HostNotificationControllerTest.host previews manual reminder without exposing raw email' --tests '*HostNotificationControllerTest.host confirms manual reminder after preview'
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add DTOs and mappers**

In `NotificationWebDtos.kt`, add:

```kotlin
data class ManualNotificationSelectionRequest(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
) {
    fun toSelection(): ManualNotificationSelection =
        ManualNotificationSelection(
            sessionId = sessionId,
            eventType = eventType,
            audience = audience,
            requestedChannels = requestedChannels,
            excludedMembershipIds = excludedMembershipIds,
            includedMembershipIds = includedMembershipIds,
            sendMode = sendMode,
        )
}

data class ManualNotificationPreviewRequest(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
) {
    fun toCommand(): ManualNotificationPreviewCommand =
        ManualNotificationPreviewCommand(
            ManualNotificationSelectionRequest(
                sessionId,
                eventType,
                audience,
                requestedChannels,
                excludedMembershipIds,
                includedMembershipIds,
                sendMode,
            ).toSelection(),
        )
}

data class ManualNotificationConfirmRequest(
    val previewId: UUID,
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
    val resendConfirmed: Boolean = false,
) {
    fun toCommand(): ManualNotificationConfirmCommand =
        ManualNotificationConfirmCommand(
            previewId = previewId,
            selection = ManualNotificationSelectionRequest(
                sessionId,
                eventType,
                audience,
                requestedChannels,
                excludedMembershipIds,
                includedMembershipIds,
                sendMode,
            ).toSelection(),
            resendConfirmed = resendConfirmed,
        )
}
```

Add response mapping functions:

```kotlin
fun ManualNotificationOptions.toResponse(): ManualNotificationOptionsResponse =
    ManualNotificationOptionsResponse(
        templates = templates.map {
            ManualNotificationTemplateOptionResponse(
                eventType = it.eventType,
                label = it.label,
                enabled = it.enabled,
                disabledReason = it.disabledReason,
                defaultAudience = it.defaultAudience,
                allowedAudiences = it.allowedAudiences.toList(),
                defaultChannels = it.defaultChannels,
            )
        },
        members = CursorPageResponse(members.map { it.toResponse() }, nextCursor),
    )

fun ManualNotificationMemberOption.toResponse(): ManualNotificationMemberOptionResponse =
    ManualNotificationMemberOptionResponse(
        membershipId = membershipId,
        displayName = displayName,
        maskedEmail = maskedEmail,
        role = role,
        membershipStatus = membershipStatus,
        sessionParticipationStatus = sessionParticipationStatus,
        attendanceStatus = attendanceStatus,
        emailEligibility = emailEligibility,
        inAppEligibility = inAppEligibility,
    )

fun ManualNotificationPreview.toResponse(): ManualNotificationPreviewResponse =
    ManualNotificationPreviewResponse(previewId, expiresAt.toString(), template, audience, channels, duplicates, warnings)

fun ManualNotificationConfirmResult.toResponse(): ManualNotificationConfirmResponse =
    ManualNotificationConfirmResponse(manualDispatchId, eventId, status, createdAt.toString(), summary)
```

Define response DTOs with the same property names as the design spec.

- [ ] **Step 4: Add controller endpoints**

Inject `ManageManualHostNotificationsUseCase` into `HostNotificationController`, then add:

```kotlin
@GetMapping("/manual/options")
fun manualOptions(
    host: CurrentMember,
    @RequestParam(required = false) sessionId: UUID?,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): ManualNotificationOptionsResponse =
    manageManualHostNotificationsUseCase
        .options(host, sessionId, PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100))
        .toResponse()

@PostMapping("/manual/preview")
fun previewManual(
    host: CurrentMember,
    @RequestBody request: ManualNotificationPreviewRequest,
): ManualNotificationPreviewResponse =
    manageManualHostNotificationsUseCase.preview(host, request.toCommand()).toResponse()

@PostMapping("/manual")
fun confirmManual(
    host: CurrentMember,
    @RequestBody request: ManualNotificationConfirmRequest,
): ManualNotificationConfirmResponse =
    manageManualHostNotificationsUseCase.confirm(host, request.toCommand()).toResponse()
```

- [ ] **Step 5: Run controller tests**

```bash
./server/gradlew -p server test --tests '*HostNotificationControllerTest'
```

Expected: PASS.

- [ ] **Step 6: Run server architecture checks**

```bash
./server/gradlew -p server test --tests '*ServerArchitectureBoundaryTest'
```

Expected: PASS. If it fails, move HTTP or JDBC dependencies back into adapter packages instead of suppressing the test.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt \
  server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt \
  server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
git commit -m "feat: expose manual notification API"
```

---

### Task 6: Frontend API Contracts and Route State

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing route/API test**

In `host-notifications.test.tsx`, add a render case that expects the manual workbench props:

```tsx
it("renders manual notification workbench before ledgers", () => {
  renderPage({
    manualOptions: {
      templates: [
        {
          eventType: "SESSION_REMINDER_DUE",
          label: "모임 전날 리마인더",
          enabled: true,
          disabledReason: null,
          defaultAudience: "ALL_ACTIVE_MEMBERS",
          allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
          defaultChannels: "BOTH",
        },
      ],
      members: { items: [], nextCursor: null },
    },
  });

  expect(screen.getByRole("heading", { name: "새 알림 발송" })).toBeInTheDocument();
  expect(screen.getByText("모임 전날 리마인더")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "운영 장부" })).toBeInTheDocument();
});
```

Update `renderPage` helper to accept `manualOptions` only after the contracts exist.

- [ ] **Step 2: Run frontend unit test to verify failure**

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: FAIL because manual option props/types do not exist.

- [ ] **Step 3: Add host contracts**

Append to `host-contracts.ts`:

```ts
export type ManualNotificationAudience = "ALL_ACTIVE_MEMBERS" | "SESSION_PARTICIPANTS" | "CONFIRMED_ATTENDEES";
export type ManualNotificationRequestedChannels = "IN_APP" | "EMAIL" | "BOTH";
export type ManualNotificationSendMode = "NOW";
export type ManualNotificationEligibility = "ELIGIBLE" | "INELIGIBLE" | "EMAIL_DISABLED" | "EMAIL_MISSING";

export type ManualNotificationTemplateOption = {
  eventType: HostNotificationEventType;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  defaultAudience: ManualNotificationAudience;
  allowedAudiences: ManualNotificationAudience[];
  defaultChannels: ManualNotificationRequestedChannels;
};

export type ManualNotificationMemberOption = {
  membershipId: string;
  displayName: string;
  maskedEmail: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  sessionParticipationStatus: SessionParticipationStatus | null;
  attendanceStatus: AttendanceStatus | null;
  emailEligibility: ManualNotificationEligibility;
  inAppEligibility: ManualNotificationEligibility;
};

export type ManualNotificationOptionsResponse = {
  templates: ManualNotificationTemplateOption[];
  members: PagedResponse<ManualNotificationMemberOption>;
};

export type ManualNotificationSelectionRequest = {
  sessionId: string;
  eventType: HostNotificationEventType;
  audience: ManualNotificationAudience;
  requestedChannels: ManualNotificationRequestedChannels;
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: ManualNotificationSendMode;
};

export type ManualNotificationPreviewRequest = ManualNotificationSelectionRequest;

export type ManualNotificationPreviewResponse = {
  previewId: string;
  expiresAt: string;
  template: {
    eventType: HostNotificationEventType;
    label: string;
    subject: string;
    bodyPreview: string;
  };
  audience: {
    baseGroup: ManualNotificationAudience;
    baseCount: number;
    excludedCount: number;
    includedCount: number;
    finalTargetCount: number;
  };
  channels: {
    requested: ManualNotificationRequestedChannels;
    inAppEligibleCount: number;
    emailEligibleCount: number;
    emailSkippedByPreferenceCount: number;
    emailMissingCount: number;
  };
  duplicates: {
    requiresResendConfirmation: boolean;
    recentDispatches: Array<{
      manualDispatchId: string;
      eventType: HostNotificationEventType;
      requestedChannels: ManualNotificationRequestedChannels;
      createdAt: string;
      requestedBy: string;
      targetCount: number;
    }>;
  };
  warnings: Array<{ code: string; message: string }>;
};

export type ManualNotificationConfirmRequest = ManualNotificationSelectionRequest & {
  previewId: string;
  resendConfirmed: boolean;
};

export type ManualNotificationConfirmResponse = {
  manualDispatchId: string;
  eventId: string;
  status: NotificationEventOutboxStatus;
  createdAt: string;
  summary: {
    targetCount: number;
    requestedChannels: ManualNotificationRequestedChannels;
    expectedInAppCount: number;
    expectedEmailCount: number;
  };
};
```

- [ ] **Step 4: Add API functions**

In `host-api.ts`:

```ts
export function fetchManualNotificationOptions(
  context?: ReadmatesApiContext,
  request?: { sessionId?: string; page?: PageRequest },
) {
  const params = new URLSearchParams();
  if (request?.sessionId) params.set("sessionId", request.sessionId);
  const pageParams = pagingSearchParams(request?.page);
  const pageSearch = pageParams.startsWith("?") ? pageParams.slice(1) : "";
  if (pageSearch) {
    new URLSearchParams(pageSearch).forEach((value, key) => params.set(key, value));
  }
  const search = params.toString();
  return readmatesFetch<ManualNotificationOptionsResponse>(
    `/api/host/notifications/manual/options${search ? `?${search}` : ""}`,
    undefined,
    context,
  );
}

export function previewManualNotification(request: ManualNotificationPreviewRequest) {
  return readmatesFetch<ManualNotificationPreviewResponse>("/api/host/notifications/manual/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function confirmManualNotification(request: ManualNotificationConfirmRequest) {
  return readmatesFetch<ManualNotificationConfirmResponse>("/api/host/notifications/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
```

- [ ] **Step 5: Update route data and route state**

In `host-notifications-data.ts`, include `manualOptions` in loader:

```ts
export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventListResponse;
  deliveries: HostNotificationDeliveryListResponse;
  audit: NotificationTestMailAuditPage;
  manualOptions: ManualNotificationOptionsResponse;
  initialManualSelection: {
    sessionId: string | null;
    eventType: HostNotificationEventType | null;
  };
};
```

Parse query params from `args.request.url`:

```ts
const url = args?.request ? new URL(args.request.url) : null;
const sessionId = url?.searchParams.get("sessionId") ?? null;
const eventType = (url?.searchParams.get("eventType") as HostNotificationEventType | null) ?? null;
```

Load options in `Promise.all`:

```ts
fetchManualNotificationOptions(context, { sessionId: sessionId ?? undefined }),
```

Expose actions:

```ts
previewManual: previewManualNotification,
confirmManual: confirmManualNotification,
loadManualOptions: (sessionId?: string, page?: PageRequest) => fetchManualNotificationOptions(undefined, { sessionId, page }),
```

In `host-notifications-route.tsx`, pass `manualOptions`, `initialManualSelection`, `onPreviewManual`, `onConfirmManual`, and `onLoadManualMembers` to `HostNotificationsPage`.

- [ ] **Step 6: Run frontend focused tests**

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: The new test still fails until the UI workbench exists; existing tests should still pass or fail only on missing props.

- [ ] **Step 7: Commit**

```bash
git add front/features/host/api/host-contracts.ts \
  front/features/host/api/host-api.ts \
  front/features/host/route/host-notifications-data.ts \
  front/features/host/route/host-notifications-route.tsx \
  front/tests/unit/host-notifications.test.tsx
git commit -m "feat: add manual notification frontend contracts"
```

---

### Task 7: Host Notification Workbench UI

**Files:**
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Create: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Create: `front/features/host/ui/notifications/manual-notification-member-picker.tsx`
- Create: `front/features/host/ui/notifications/manual-notification-preview.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing interaction tests**

Add tests:

```tsx
it("previews and confirms a manual notification with resend confirmation", async () => {
  const user = userEvent.setup();
  const onPreviewManual = vi.fn().mockResolvedValue({
    previewId: "preview-1",
    expiresAt: "2026-05-13T09:10:00Z",
    template: {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      subject: "모임 전날 리마인더",
      bodyPreview: "모임 전 준비를 확인해 주세요.",
    },
    audience: {
      baseGroup: "ALL_ACTIVE_MEMBERS",
      baseCount: 3,
      excludedCount: 0,
      includedCount: 0,
      finalTargetCount: 3,
    },
    channels: {
      requested: "BOTH",
      inAppEligibleCount: 3,
      emailEligibleCount: 2,
      emailSkippedByPreferenceCount: 1,
      emailMissingCount: 0,
    },
    duplicates: {
      requiresResendConfirmation: true,
      recentDispatches: [
        {
          manualDispatchId: "dispatch-1",
          eventType: "SESSION_REMINDER_DUE",
          requestedChannels: "BOTH",
          createdAt: "2026-05-12T09:00:00Z",
          requestedBy: "h***@example.com",
          targetCount: 3,
        },
      ],
    },
    warnings: [{ code: "EMAIL_PREFERENCE_SKIPS", message: "이메일 알림 설정 때문에 1명에게는 이메일이 가지 않습니다." }],
  });
  const onConfirmManual = vi.fn().mockResolvedValue(undefined);

  renderPage({ onPreviewManual, onConfirmManual, manualOptions: manualOptionsFixture });

  await user.click(screen.getByRole("button", { name: "모임 전날 리마인더" }));
  await user.click(screen.getByRole("button", { name: "미리보기" }));

  expect(await screen.findByText("앱 알림 3명")).toBeInTheDocument();
  expect(screen.getByText("이메일 2명")).toBeInTheDocument();
  expect(screen.getByText("이미 발송된 알림입니다.")).toBeInTheDocument();

  const confirm = screen.getByRole("button", { name: "발송 확인" });
  expect(confirm).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "재발송을 확인했습니다" }));
  await user.click(confirm);

  expect(onConfirmManual).toHaveBeenCalledWith(expect.objectContaining({ previewId: "preview-1", resendConfirmed: true }));
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Create `ManualNotificationWorkbench`**

Create `manual-notification-workbench.tsx` with prop-driven state:

```tsx
import { useMemo, useState } from "react";
import type {
  HostNotificationEventType,
  ManualNotificationAudience,
  ManualNotificationConfirmRequest,
  ManualNotificationMemberOption,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/api/host-contracts";
import { ManualNotificationMemberPicker } from "./manual-notification-member-picker";
import { ManualNotificationPreviewPanel } from "./manual-notification-preview";

type Selection = {
  sessionId: string;
  eventType: HostNotificationEventType;
  audience: ManualNotificationAudience;
  requestedChannels: ManualNotificationRequestedChannels;
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: "NOW";
};

export function ManualNotificationWorkbench({
  options,
  initialSessionId,
  initialEventType,
  preview,
  busy,
  error,
  onPreview,
  onConfirm,
}: {
  options: ManualNotificationOptionsResponse;
  initialSessionId: string | null;
  initialEventType: HostNotificationEventType | null;
  preview: ManualNotificationPreviewResponse | null;
  busy: boolean;
  error: string | null;
  onPreview: (request: ManualNotificationPreviewRequest) => Promise<void>;
  onConfirm: (request: ManualNotificationConfirmRequest) => Promise<void>;
}) {
  const firstEnabledTemplate = options.templates.find((template) => template.enabled);
  const initialTemplate = options.templates.find((template) => template.eventType === initialEventType && template.enabled) ?? firstEnabledTemplate;
  const [selection, setSelection] = useState<Selection>(() => ({
    sessionId: initialSessionId ?? "",
    eventType: initialTemplate?.eventType ?? "SESSION_REMINDER_DUE",
    audience: initialTemplate?.defaultAudience ?? "ALL_ACTIVE_MEMBERS",
    requestedChannels: initialTemplate?.defaultChannels ?? "BOTH",
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  }));
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const currentTemplate = useMemo(
    () => options.templates.find((template) => template.eventType === selection.eventType),
    [options.templates, selection.eventType],
  );
  const canPreview = Boolean(selection.sessionId && currentTemplate?.enabled && !busy);
  const requiresResend = Boolean(preview?.duplicates.requiresResendConfirmation);
  const canConfirm = Boolean(preview && !busy && (!requiresResend || resendConfirmed));

  return (
    <section className="rm-document-panel" aria-labelledby="manual-notification-title" style={{ padding: "22px 24px", marginBottom: 20 }}>
      <div className="row-between" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">운영 · 수동 발송</div>
          <h2 id="manual-notification-title" className="h2 editorial" style={{ margin: "6px 0 0" }}>
            새 알림 발송
          </h2>
        </div>
      </div>
      {error ? <p role="alert" className="small" style={{ color: "var(--danger)", margin: "12px 0 0" }}>{error}</p> : null}
      <div className="stack" style={{ "--stack": "18px", marginTop: 18 } as React.CSSProperties}>
        <div>
          <div className="label">템플릿</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {options.templates.map((template) => (
              <button
                key={template.eventType}
                type="button"
                className={`btn btn-sm ${selection.eventType === template.eventType ? "btn-primary" : "btn-quiet"}`}
                disabled={!template.enabled || busy}
                aria-label={template.disabledReason ? `${template.label}: ${template.disabledReason}` : template.label}
                onClick={() => {
                  setSelection((current) => ({
                    ...current,
                    eventType: template.eventType,
                    audience: template.defaultAudience,
                    requestedChannels: template.defaultChannels,
                  }));
                  setResendConfirmed(false);
                }}
              >
                {template.label}
              </button>
            ))}
          </div>
          {currentTemplate?.disabledReason ? <p className="tiny muted" style={{ margin: "8px 0 0" }}>{currentTemplate.disabledReason}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="manual-notification-session">세션 ID</label>
          <input
            id="manual-notification-session"
            className="input"
            value={selection.sessionId}
            onChange={(event) => setSelection((current) => ({ ...current, sessionId: event.currentTarget.value }))}
            placeholder="세션을 선택하거나 세션 화면에서 진입하세요"
          />
        </div>
        <div>
          <div className="label">채널</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {[
              ["BOTH", "앱+이메일"],
              ["IN_APP", "앱 알림"],
              ["EMAIL", "이메일"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm ${selection.requestedChannels === value ? "btn-primary" : "btn-quiet"}`}
                disabled={busy}
                onClick={() => setSelection((current) => ({ ...current, requestedChannels: value as ManualNotificationRequestedChannels }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ManualNotificationMemberPicker
          members={options.members.items}
          excludedIds={selection.excludedMembershipIds}
          includedIds={selection.includedMembershipIds}
          disabled={busy}
          onExcludedIdsChange={(excludedMembershipIds) => setSelection((current) => ({ ...current, excludedMembershipIds }))}
          onIncludedIdsChange={(includedMembershipIds) => setSelection((current) => ({ ...current, includedMembershipIds }))}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={!canPreview} onClick={() => onPreview(selection)}>
          {busy ? "확인 중" : "미리보기"}
        </button>
        {preview ? (
          <ManualNotificationPreviewPanel
            preview={preview}
            resendConfirmed={resendConfirmed}
            disabled={!canConfirm}
            busy={busy}
            onResendConfirmedChange={setResendConfirmed}
            onConfirm={() => onConfirm({ ...selection, previewId: preview.previewId, resendConfirmed })}
          />
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create member picker**

Create `manual-notification-member-picker.tsx`:

```tsx
import type { ManualNotificationMemberOption } from "@/features/host/api/host-contracts";

export function ManualNotificationMemberPicker({
  members,
  excludedIds,
  includedIds,
  disabled,
  onExcludedIdsChange,
  onIncludedIdsChange,
}: {
  members: ManualNotificationMemberOption[];
  excludedIds: string[];
  includedIds: string[];
  disabled: boolean;
  onExcludedIdsChange: (ids: string[]) => void;
  onIncludedIdsChange: (ids: string[]) => void;
}) {
  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  return (
    <section aria-labelledby="manual-notification-members-title">
      <div className="row-between" style={{ gap: 12, alignItems: "baseline", marginBottom: 8 }}>
        <h3 id="manual-notification-members-title" className="h4 editorial" style={{ margin: 0 }}>
          대상 조정
        </h3>
        <span className="tiny muted">제외 {excludedIds.length}명 · 추가 {includedIds.length}명</span>
      </div>
      {members.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>표시할 멤버가 없습니다.</p>
      ) : (
        <div className="stack" style={{ "--stack": "0px" } as React.CSSProperties}>
          {members.map((member, index) => (
            <article
              key={member.membershipId}
              className="row-between"
              style={{ gap: 12, padding: "12px 0", borderTop: index === 0 ? undefined : "1px solid var(--line-soft)", flexWrap: "wrap" }}
            >
              <span style={{ minWidth: 0 }}>
                <strong className="body" style={{ display: "block" }}>{member.displayName}</strong>
                <span className="tiny muted">{member.maskedEmail}</span>
              </span>
              <span className="row wrap" style={{ gap: 6 }}>
                <span className="badge">{member.emailEligibility === "ELIGIBLE" ? "이메일 가능" : "이메일 제외"}</span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={disabled}
                  onClick={() => onExcludedIdsChange(toggle(excludedIds, member.membershipId))}
                >
                  {excludedIds.includes(member.membershipId) ? "제외 취소" : "제외"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={disabled}
                  onClick={() => onIncludedIdsChange(toggle(includedIds, member.membershipId))}
                >
                  {includedIds.includes(member.membershipId) ? "추가 취소" : "추가"}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Create preview panel**

Create `manual-notification-preview.tsx`:

```tsx
import type { ManualNotificationPreviewResponse } from "@/features/host/api/host-contracts";

export function ManualNotificationPreviewPanel({
  preview,
  resendConfirmed,
  disabled,
  busy,
  onResendConfirmedChange,
  onConfirm,
}: {
  preview: ManualNotificationPreviewResponse;
  resendConfirmed: boolean;
  disabled: boolean;
  busy: boolean;
  onResendConfirmedChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <section aria-labelledby="manual-notification-preview-title" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16 }}>
      <h3 id="manual-notification-preview-title" className="h4 editorial" style={{ margin: 0 }}>
        발송 전 확인
      </h3>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <span className="badge badge-accent badge-dot">앱 알림 {preview.channels.inAppEligibleCount}명</span>
        <span className="badge badge-accent badge-dot">이메일 {preview.channels.emailEligibleCount}명</span>
        <span className="badge">최종 대상 {preview.audience.finalTargetCount}명</span>
      </div>
      {preview.warnings.map((warning) => (
        <p key={warning.code} role="status" className="small" style={{ color: "var(--text-2)", margin: "10px 0 0" }}>
          {warning.message}
        </p>
      ))}
      {preview.duplicates.requiresResendConfirmation ? (
        <div style={{ marginTop: 14, padding: "12px 0", borderTop: "1px solid var(--line-soft)" }}>
          <p className="body" style={{ margin: 0, fontWeight: 700 }}>이미 발송된 알림입니다.</p>
          <label className="row" style={{ gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={resendConfirmed}
              onChange={(event) => onResendConfirmedChange(event.currentTarget.checked)}
            />
            <span className="small">재발송을 확인했습니다</span>
          </label>
        </div>
      ) : null}
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled || busy} style={{ marginTop: 14 }} onClick={onConfirm}>
        {busy ? "발송 요청 중" : "발송 확인"}
      </button>
    </section>
  );
}
```

- [ ] **Step 6: Wire the workbench into `HostNotificationsPage`**

Add props for `manualOptions`, `initialManualSelection`, `manualPreview`, callbacks, and manual error state. Render `<ManualNotificationWorkbench />` before `<HostNotificationsSummary />`.

Keep the layout as one top workbench plus ledger grid below. Do not place `surface` inside another `surface`; use the workbench as a single `rm-document-panel`.

- [ ] **Step 7: Run unit tests**

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/host/ui/host-notifications-page.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.tsx \
  front/features/host/ui/notifications/manual-notification-member-picker.tsx \
  front/features/host/ui/notifications/manual-notification-preview.tsx \
  front/tests/unit/host-notifications.test.tsx
git commit -m "feat: add manual notification workbench"
```

---

### Task 8: Session Editor Quick Links

**Files:**
- Create: `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Test: `front/tests/unit/host-session-notifications.test.tsx`

- [ ] **Step 1: Write failing quick-link test**

Create `front/tests/unit/host-session-notifications.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostSessionNotificationActions } from "@/features/host/ui/session-editor/session-editor-notifications";

describe("HostSessionNotificationActions", () => {
  it("links available templates to the manual notification workbench", () => {
    render(
      <HostSessionNotificationActions
        sessionId="session-1"
        state="OPEN"
        visibility="MEMBER"
        feedbackDocumentUploaded
      />,
    );

    expect(screen.getByRole("link", { name: "모임 전날 리마인더" })).toHaveAttribute(
      "href",
      "/app/host/notifications?sessionId=session-1&eventType=SESSION_REMINDER_DUE",
    );
    expect(screen.getByRole("link", { name: "피드백 문서 등록" })).toHaveAttribute(
      "href",
      "/app/host/notifications?sessionId=session-1&eventType=FEEDBACK_DOCUMENT_PUBLISHED",
    );
  });

  it("disables feedback notification when feedback document is missing", () => {
    render(
      <HostSessionNotificationActions
        sessionId="session-1"
        state="OPEN"
        visibility="MEMBER"
        feedbackDocumentUploaded={false}
      />,
    );

    expect(screen.getByRole("button", { name: /피드백 문서 등록/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --dir front test -- host-session-notifications.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Create the quick-link component**

Create `session-editor-notifications.tsx`:

```tsx
import type { SessionState } from "@/shared/model/readmates-types";
import type { SessionRecordVisibility } from "@/features/host/api/host-contracts";

type NotificationAction = {
  eventType: "NEXT_BOOK_PUBLISHED" | "SESSION_REMINDER_DUE" | "FEEDBACK_DOCUMENT_PUBLISHED";
  label: string;
  enabled: boolean;
  disabledReason: string;
};

export function HostSessionNotificationActions({
  sessionId,
  state,
  visibility,
  feedbackDocumentUploaded,
}: {
  sessionId: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
  feedbackDocumentUploaded: boolean;
}) {
  const actions: NotificationAction[] = [
    {
      eventType: "NEXT_BOOK_PUBLISHED",
      label: "다음 책 공개",
      enabled: visibility === "MEMBER" || visibility === "PUBLIC",
      disabledReason: "멤버에게 보이는 세션만 발송할 수 있습니다.",
    },
    {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      enabled: state === "DRAFT" || state === "OPEN",
      disabledReason: "예정 또는 열린 세션만 리마인더를 보낼 수 있습니다.",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      label: "피드백 문서 등록",
      enabled: feedbackDocumentUploaded,
      disabledReason: "피드백 문서를 먼저 등록해야 합니다.",
    },
  ];

  return (
    <section className="rm-reading-desk" aria-labelledby="session-notifications-title" style={{ padding: "18px" }}>
      <div className="eyebrow" id="session-notifications-title">알림 발송</div>
      <div className="stack" style={{ "--stack": "0px" } as React.CSSProperties}>
        {actions.map((action, index) => (
          <div key={action.eventType} className="row-between" style={{ gap: 12, padding: "12px 0", borderTop: index === 0 ? undefined : "1px solid var(--line-soft)" }}>
            <span className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>{action.label}</span>
            {action.enabled ? (
              <a className="btn btn-quiet btn-sm" href={`/app/host/notifications?sessionId=${encodeURIComponent(sessionId)}&eventType=${action.eventType}`}>
                {action.label}
              </a>
            ) : (
              <button type="button" className="btn btn-quiet btn-sm" disabled aria-label={`${action.label}: ${action.disabledReason}`}>
                준비 필요
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Render it in `host-session-editor.tsx`**

Import the component:

```tsx
import { HostSessionNotificationActions } from "./session-editor/session-editor-notifications";
```

Render it near feedback/publication management where `displaySession` is available:

```tsx
{displaySession ? (
  <HostSessionNotificationActions
    sessionId={displaySession.sessionId}
    state={displaySession.state}
    visibility={displaySession.visibility}
    feedbackDocumentUploaded={displaySession.feedbackDocument.uploaded}
  />
) : null}
```

- [ ] **Step 5: Run focused tests**

```bash
pnpm --dir front test -- host-session-notifications.test.tsx
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/host/ui/session-editor/session-editor-notifications.tsx \
  front/features/host/ui/host-session-editor.tsx \
  front/tests/unit/host-session-notifications.test.tsx
git commit -m "feat: link sessions to manual notifications"
```

---

### Task 9: Member Notification UI Polish

**Files:**
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Test: `front/tests/unit/member-notifications.test.tsx`

- [ ] **Step 1: Add failing member notification UI tests**

Append:

```tsx
it("uses product labels and row-level navigation affordance", () => {
  render(
    <MemberNotificationsPage
      unreadCount={1}
      items={[{ ...unreadNotification, eventType: "SESSION_REMINDER_DUE", title: "내일 모임이 있습니다" }]}
      onMarkRead={() => undefined}
      onMarkAllRead={() => undefined}
    />,
  );

  expect(screen.getByText("모임 전날")).toBeInTheDocument();
  expect(screen.getByText("읽지 않음")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /내일 모임이 있습니다/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure or snapshot mismatch**

```bash
pnpm --dir front test -- member-notifications.test.tsx
```

Expected: FAIL if current label is still "모임 리마인더" and link name is too narrow.

- [ ] **Step 3: Update labels and row structure**

In `member-notifications-page.tsx`, change labels:

```ts
const eventLabels: Record<NotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 책",
  SESSION_REMINDER_DUE: "모임 전날",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서",
  REVIEW_PUBLISHED: "서평",
};
```

In the row `<article>`, use a stable left unread marker and make the link text include title plus action context:

```tsx
<article
  key={item.id}
  className="surface-quiet"
  data-unread={unread ? "true" : "false"}
  style={{
    display: "grid",
    gridTemplateColumns: "4px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 16,
    padding: "18px 20px",
    borderColor: unread ? "var(--line-strong)" : undefined,
    background: unread ? "var(--bg)" : undefined,
  }}
>
  <span aria-hidden="true" style={{ width: 4, alignSelf: "stretch", background: unread ? "var(--accent)" : "transparent", borderRadius: 999 }} />
  <div style={{ minWidth: 0 }}>
    ...
    <a
      href={href}
      className="h3 editorial"
      aria-label={`${item.title} 열기`}
      ...
    >
      {item.title}
    </a>
    ...
  </div>
  ...
</article>
```

Keep the existing `scopedAppLinkTarget`, read-before-navigation behavior, pending states, and `markAllRead` behavior unchanged.

- [ ] **Step 4: Run member notification tests**

```bash
pnpm --dir front test -- member-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/notifications/ui/member-notifications-page.tsx \
  front/tests/unit/member-notifications.test.tsx
git commit -m "style: clarify member notification inbox"
```

---

### Task 10: E2E and Verification

**Files:**
- Create or modify: `front/tests/e2e/manual-notifications.spec.ts`
- No production code changes unless tests expose a bug.

- [ ] **Step 1: Add E2E smoke test**

Create `manual-notifications.spec.ts` if the project has a stable host login fixture. If not, add this scenario to the existing authenticated multi-club E2E fixture:

```ts
import { expect, test } from "@playwright/test";

test("host can open manual notification workbench", async ({ page }) => {
  await page.goto("/clubs/reading-sai/app/host/notifications");
  await expect(page.getByRole("heading", { name: "새 알림 발송" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 전날 리마인더" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "운영 장부" })).toBeVisible();
});
```

- [ ] **Step 2: Run targeted frontend checks**

```bash
pnpm --dir front lint
pnpm --dir front test -- host-notifications.test.tsx member-notifications.test.tsx host-session-notifications.test.tsx
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 3: Run targeted server checks**

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest' --tests '*JdbcManualNotificationDispatchAdapterTest' --tests '*JdbcNotificationDeliveryAdapterTest' --tests '*HostNotificationControllerTest'
./server/gradlew -p server test --tests '*ServerArchitectureBoundaryTest'
```

Expected: PASS.

- [ ] **Step 4: Run full relevant checks**

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

Expected: PASS. If `test:e2e` cannot run because local auth fixtures or browsers are unavailable, record the exact command and reason in the final implementation notes.

- [ ] **Step 5: Manual responsive QA**

Start the frontend if needed:

```bash
pnpm --dir front dev
```

Open `/clubs/reading-sai/app/host/notifications` and inspect:

- Desktop width around 1280px: workbench appears first, ledger below, no nested card border overlap.
- Mobile width around 390px: template/channel buttons wrap cleanly, preview counts do not overlap, confirmation checkbox and button are reachable.
- `/clubs/reading-sai/app/notifications`: unread marker, label, title, body, read button, and row link do not overlap.

- [ ] **Step 6: Commit E2E or verification-only notes**

If an E2E test file changed:

```bash
git add front/tests/e2e/manual-notifications.spec.ts
git commit -m "test: cover manual notification workbench"
```

If no files changed, do not create an empty commit. Record verification output in the implementation final response.

---

## Self-Review Checklist

- Spec coverage:
  - Manual dispatch workbench: Tasks 6-8.
  - Host preview/confirm and duplicate policy: Tasks 2, 3, 5, 7.
  - Existing event pipeline reuse: Tasks 3-5.
  - Email preference respected: Tasks 3-4.
  - Session quick links: Task 8.
  - Member inbox clarity: Task 9.
  - Mobile/desktop design check: Task 10.
- Placeholder scan:
  - No unresolved placeholder language remains in task steps.
  - Code snippets use concrete names and commands.
- Type consistency:
  - `ManualNotificationRequestedChannels`, `ManualNotificationAudience`, and `ManualNotificationSendMode` use the same names in Kotlin and TypeScript.
  - Frontend request fields match server DTO fields: `sessionId`, `eventType`, `audience`, `requestedChannels`, `excludedMembershipIds`, `includedMembershipIds`, `sendMode`, `previewId`, `resendConfirmed`.
  - Delivery planning reads `NotificationEventPayload.manualDispatch`, which Task 1 adds.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-readmates-manual-notification-dispatch-implementation-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
