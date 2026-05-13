# ReadMates Manual Notification Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual notification dispatches recipient-stable, preview-idempotent, and consistent with automatic notification template predicates.

**Architecture:** Keep the notification clean-architecture slice intact. Application services validate host intent and build immutable manual payloads, persistence adapters own preview locking and outbox/manual audit writes, and delivery planning consumes frozen manual recipient snapshots instead of recomputing audience groups after confirm.

**Tech Stack:** Kotlin/Spring Boot, MySQL/Flyway, JDBC, Jackson Kotlin JSON payloads, React/Vite, React Router 7, Vitest/Testing Library, Playwright E2E.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-05-14-readmates-manual-notification-hardening-spec.md`
- Original manual dispatch spec: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md`
- Completion spec: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md`
- Session selector spec: `docs/superpowers/specs/2026-05-14-readmates-manual-notification-session-selector-design.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Design guide: `docs/agents/design.md`
- Architecture source of truth: `docs/development/architecture.md`

## File Structure

### Server

- Create `server/src/main/resources/db/mysql/migration/V28__manual_notification_dispatch_hardening.sql`
  - Add preview consumption columns and manual dispatch `preview_id`.

- Modify `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
  - Add frozen recipient id lists to `NotificationManualDispatchPayload`.

- Modify `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
  - Add target id lists to `ManualNotificationTargetSnapshot`.
  - Add models for transactional confirm result and preview consumption state.
  - Replace the separate `findPreview` + `insertManualDispatch` confirm path with a transactional `confirmManualDispatch`.

- Modify `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
  - Align template disabled conditions.
  - Build manual payload with frozen target snapshot.
  - Delegate preview consumption and dispatch insert to the new transactional port method.

- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
  - Return frozen id lists from `previewTargets`.
  - Implement preview row locking, idempotent consumed-preview handling, preview-id dedupe key, and `preview_id` audit writes.

- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
  - Use frozen manual recipient snapshots when present.
  - Keep legacy fallback for old manual payloads without frozen recipient ids.

- Test `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

### Frontend

- Modify `front/features/host/ui/session-editor/session-editor-notifications.tsx`
  - Align client-side enabled conditions and disabled copy.

- Modify `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Keep server options as final truth and make confirm pending state resistant to duplicate clicks.

- Test `front/tests/unit/host-session-notifications.test.tsx`
- Test `front/tests/unit/host-session-editor.test.tsx`
- Test `front/tests/unit/host-notifications.test.tsx`
- Test `front/tests/e2e/manual-notifications.spec.ts`
- Modify `front/tests/e2e/readmates-e2e-db.ts`
  - Add a manual dispatch count helper.
  - Delete previews before outbox rows in manual notification cleanup because previews now reference consumed outbox events.

### Docs

- Modify `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md`
  - Remove trailing whitespace reported by `git diff --check`.

- Modify `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md`
  - Remove trailing whitespace reported by `git diff --check`.

---

## Task 1: Add Migration for Preview Consumption

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V28__manual_notification_dispatch_hardening.sql`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Write the migration**

Create `V28__manual_notification_dispatch_hardening.sql`:

```sql
alter table notification_manual_dispatch_previews
  add column consumed_at datetime(6),
  add column consumed_event_id char(36);

alter table notification_manual_dispatch_previews
  add key notification_manual_dispatch_previews_consumed_event_idx (consumed_event_id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_event_fk
    foreign key (consumed_event_id, club_id) references notification_event_outbox(id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_check
    check (
      (consumed_at is null and consumed_event_id is null)
      or (consumed_at is not null and consumed_event_id is not null)
    );

alter table notification_manual_dispatches
  add column preview_id char(36) after event_id,
  add unique key notification_manual_dispatches_preview_uk (preview_id),
  add constraint notification_manual_dispatches_preview_fk
    foreign key (preview_id) references notification_manual_dispatch_previews(id);
```

- [ ] **Step 2: Run the migration-bearing persistence test class**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS or fail only because Kotlin code does not yet write `preview_id`. Migration syntax must not fail Flyway startup.

- [ ] **Step 3: If MySQL rejects the combined alter**

Split each `alter table` into one constraint/key per statement while keeping the same names and semantics. Re-run the same Gradle command. Expected: Flyway startup succeeds.

---

## Task 2: Model Frozen Manual Recipients

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`

- [ ] **Step 1: Add model assertions**

Extend `NotificationManualDispatchModelsTest` with:

```kotlin
@Test
fun `manual dispatch payload carries frozen recipient snapshots`() {
    val target = UUID.nameUUIDFromBytes("target".toByteArray())
    val email = UUID.nameUUIDFromBytes("email".toByteArray())
    val payload = NotificationManualDispatchPayload(
        id = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
        requestedByMembershipId = UUID.nameUUIDFromBytes("host".toByteArray()),
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        targetMembershipIds = listOf(target),
        inAppMembershipIds = listOf(target),
        emailMembershipIds = listOf(email),
        resend = false,
        sendMode = ManualNotificationSendMode.NOW,
    )

    assertThat(payload.targetMembershipIds).containsExactly(target)
    assertThat(payload.inAppMembershipIds).containsExactly(target)
    assertThat(payload.emailMembershipIds).containsExactly(email)
}
```

- [ ] **Step 2: Run the model test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest'
```

Expected: FAIL because the new payload fields do not exist.

- [ ] **Step 3: Add payload fields**

In `NotificationModels.kt`, change `NotificationManualDispatchPayload` to:

```kotlin
data class NotificationManualDispatchPayload(
    val id: UUID,
    val source: NotificationDispatchSource = NotificationDispatchSource.MANUAL,
    val requestedByMembershipId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val targetMembershipIds: List<UUID> = emptyList(),
    val inAppMembershipIds: List<UUID> = emptyList(),
    val emailMembershipIds: List<UUID> = emptyList(),
    val resend: Boolean = false,
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
)
```

- [ ] **Step 4: Extend target snapshot and confirm result models**

In `ManualNotificationDispatchPort.kt`, extend `ManualNotificationTargetSnapshot`:

```kotlin
data class ManualNotificationTargetSnapshot(
    val baseCount: Int,
    val excludedCount: Int,
    val includedCount: Int,
    val finalTargetCount: Int,
    val inAppEligibleCount: Int,
    val emailEligibleCount: Int,
    val emailSkippedByPreferenceCount: Int,
    val emailMissingCount: Int,
    val targetMembershipIds: List<UUID> = emptyList(),
    val inAppMembershipIds: List<UUID> = emptyList(),
    val emailMembershipIds: List<UUID> = emptyList(),
)
```

Add these port-side models:

```kotlin
enum class ManualNotificationConfirmInsertStatus {
    CREATED,
    ALREADY_CONSUMED,
}

data class ManualNotificationConfirmedDispatch(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val createdAt: OffsetDateTime,
    val status: ManualNotificationConfirmInsertStatus,
)
```

- [ ] **Step 5: Run focused model tests**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest'
```

Expected: PASS.

---

## Task 3: Align Template Availability Rules in the Service

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`

- [ ] **Step 1: Add failing service tests for template predicates**

Add tests:

```kotlin
@Test
fun `options disables next book manual notification unless session is draft and member visible`() {
    val port = FakeManualPort(sessionContext = sessionContext(state = "OPEN", visibility = "MEMBER"))
    val service = service(port)

    val options = service.options(host(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

    val nextBook = options.templates.single { it.eventType == NotificationEventType.NEXT_BOOK_PUBLISHED }
    assertThat(nextBook.enabled).isFalse()
    assertThat(nextBook.disabledReason).isEqualTo("멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다.")
}

@Test
fun `options enables feedback document manual notification only for closed or published sessions with a document`() {
    val port = FakeManualPort(sessionContext = sessionContext(state = "OPEN", feedbackDocumentUploaded = true))
    val service = service(port)

    val options = service.options(host(), SESSION_ID, null, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

    val feedback = options.templates.single { it.eventType == NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED }
    assertThat(feedback.enabled).isFalse()
    assertThat(feedback.disabledReason).isEqualTo("닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.")
}
```

Change the local helper to accept state and visibility:

```kotlin
private fun sessionContext(
    state: String = "OPEN",
    visibility: String = "MEMBER",
    feedbackDocumentUploaded: Boolean = true,
) = ManualNotificationSessionContext(
    sessionId = SESSION_ID,
    clubId = CLUB_ID,
    sessionNumber = 7,
    bookTitle = "Example Book",
    date = LocalDate.parse("2026-05-20"),
    state = state,
    visibility = visibility,
    feedbackDocumentUploaded = feedbackDocumentUploaded,
)
```

Update the existing `options disables feedback template until document exists` fixture so it isolates the missing-document case under an otherwise eligible closed session:

```kotlin
val port = FakeManualPort(
    sessionContext = sessionContext(state = "CLOSED", feedbackDocumentUploaded = false),
)
```

Update that assertion to the unified disabled copy:

```kotlin
assertThat(feedback.disabledReason).isEqualTo("닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.")
```

- [ ] **Step 2: Run the service tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest'
```

Expected: FAIL because current `NEXT_BOOK_PUBLISHED` does not require `DRAFT`, and current `FEEDBACK_DOCUMENT_PUBLISHED` does not require `CLOSED` or `PUBLISHED`.

- [ ] **Step 3: Update `disabledReason`**

In `HostManualNotificationService.disabledReason`, replace the relevant branches:

```kotlin
NotificationEventType.NEXT_BOOK_PUBLISHED ->
    if (session.state != "DRAFT" || session.visibility !in setOf("MEMBER", "PUBLIC")) {
        "멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다."
    } else {
        null
    }
NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
    if (session.state !in setOf("CLOSED", "PUBLISHED") || !session.feedbackDocumentUploaded) {
        "닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다."
    } else {
        null
    }
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest'
```

Expected: PASS after updating existing fixture states. Tests that confirm `SESSION_REMINDER_DUE` should keep `state = "OPEN"` or `state = "DRAFT"`.

---

## Task 4: Compute Frozen Target Snapshots in JDBC

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Add failing snapshot id assertions**

Extend `previewTargets applies audience edits and email preference counts`:

```kotlin
assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
assertThat(snapshot.inAppMembershipIds).hasSize(snapshot.inAppEligibleCount)
assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
assertThat(snapshot.targetMembershipIds).doesNotContain(membershipId("member2@example.com"))
```

Add an email-only test:

```kotlin
@Test
fun `previewTargets freezes only email eligible ids for email only requests`() {
    disablePreference("member1@example.com")
    val snapshot = adapter.previewTargets(
        clubId,
        selection(requestedChannels = ManualNotificationRequestedChannels.EMAIL),
    )

    assertThat(snapshot.inAppMembershipIds).isEmpty()
    assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
    assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
}
```

Update the local `selection` helper to accept `requestedChannels`:

```kotlin
private fun selection(
    requestedChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
    excludedMembershipIds: List<UUID> = emptyList(),
    includedMembershipIds: List<UUID> = emptyList(),
) = ManualNotificationSelection(
    sessionId = sessionId,
    eventType = NotificationEventType.SESSION_REMINDER_DUE,
    audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
    requestedChannels = requestedChannels,
    excludedMembershipIds = excludedMembershipIds,
    includedMembershipIds = includedMembershipIds,
    sendMode = ManualNotificationSendMode.NOW,
)
```

- [ ] **Step 2: Run the adapter test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: FAIL because snapshots do not populate id lists yet.

- [ ] **Step 3: Return frozen ids from `previewTargets`**

In `JdbcManualNotificationDispatchAdapter.previewTargets`, derive stable lists:

```kotlin
val baseIds = baseMembershipIds(clubId, selection)
val includedIds = activeMembershipIds(clubId, selection.includedMembershipIds)
val excludedIds = selection.excludedMembershipIds.toSet()
val finalIds = (baseIds - excludedIds + includedIds).sortedBy { it.toString() }
if (finalIds.isEmpty()) {
    return ManualNotificationTargetSnapshot(
        baseCount = baseIds.size,
        excludedCount = selection.excludedMembershipIds.count { it in baseIds },
        includedCount = includedIds.size,
        finalTargetCount = 0,
        inAppEligibleCount = 0,
        emailEligibleCount = 0,
        emailSkippedByPreferenceCount = 0,
        emailMissingCount = 0,
        targetMembershipIds = emptyList(),
        inAppMembershipIds = emptyList(),
        emailMembershipIds = emptyList(),
    )
}
val eligibility = emailEligibility(clubId, selection.eventType, finalIds)
val inAppIds = if (selection.requestedChannels != ManualNotificationRequestedChannels.EMAIL) finalIds else emptyList()
val emailIds = if (selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP) eligibility.eligibleIds else emptyList()
return ManualNotificationTargetSnapshot(
    baseCount = baseIds.size,
    excludedCount = selection.excludedMembershipIds.count { it in baseIds },
    includedCount = includedIds.size,
    finalTargetCount = finalIds.size,
    inAppEligibleCount = inAppIds.size,
    emailEligibleCount = emailIds.size,
    emailSkippedByPreferenceCount = if (selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP) eligibility.preferenceSkipped else 0,
    emailMissingCount = if (selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP) eligibility.missing else 0,
    targetMembershipIds = finalIds,
    inAppMembershipIds = inAppIds,
    emailMembershipIds = emailIds,
)
```

Replace `emailEligibilityCounts` with a function that returns eligible ids and counts:

```kotlin
private fun emailEligibility(clubId: UUID, eventType: NotificationEventType, membershipIds: List<UUID>): EmailEligibility {
    val preferenceColumn = when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
        NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
        NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
    }
    val placeholders = membershipIds.joinToString(",") { "?" }
    val rows = jdbcTemplate.query(
        """
        select
          memberships.id,
          users.email,
          coalesce(notification_preferences.email_enabled, true) as email_enabled,
          coalesce(notification_preferences.$preferenceColumn, true) as event_enabled
        from memberships
        join users on users.id = memberships.user_id
        left join notification_preferences on notification_preferences.membership_id = memberships.id
          and notification_preferences.club_id = memberships.club_id
        where memberships.club_id = ?
          and memberships.id in ($placeholders)
        """.trimIndent(),
        { rs, _ ->
            EmailEligibilityRow(
                membershipId = rs.uuid("id"),
                email = rs.getString("email"),
                emailEnabled = rs.getBoolean("email_enabled"),
                eventEnabled = rs.getBoolean("event_enabled"),
            )
        },
        *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
    )
    return EmailEligibility(
        eligibleIds = rows
            .filter { !it.email.isNullOrBlank() && it.emailEnabled && it.eventEnabled }
            .map { it.membershipId }
            .sortedBy { it.toString() },
        preferenceSkipped = rows.count { !it.email.isNullOrBlank() && !(it.emailEnabled && it.eventEnabled) },
        missing = rows.count { it.email.isNullOrBlank() },
    )
}
```

Add local data classes:

```kotlin
private data class EmailEligibility(
    val eligibleIds: List<UUID>,
    val preferenceSkipped: Int,
    val missing: Int,
)

private data class EmailEligibilityRow(
    val membershipId: UUID,
    val email: String?,
    val emailEnabled: Boolean,
    val eventEnabled: Boolean,
)
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS.

---

## Task 5: Make Confirm Transactional and Idempotent

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Update the port contract**

In `ManualNotificationDispatchPort`, remove confirm-time use of `findPreview` from the service path and add:

```kotlin
fun confirmManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
    selection: ManualNotificationSelection,
    payload: NotificationEventPayload,
    targetSnapshot: ManualNotificationTargetSnapshot,
    resend: Boolean,
): ManualNotificationConfirmedDispatch?
```

Keep `findPreview` for the existing host-scoped preview round-trip adapter test. The service confirm path must call `confirmManualDispatch`.

- [ ] **Step 2: Update service fake and add idempotency test**

In `HostManualNotificationServiceTest.FakeManualPort.previewTargets`, include deterministic frozen ids in the returned snapshot:

```kotlin
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
        targetMembershipIds = listOf(
            UUID.nameUUIDFromBytes("target-1".toByteArray()),
            UUID.nameUUIDFromBytes("target-2".toByteArray()),
            UUID.nameUUIDFromBytes("target-3".toByteArray()),
        ),
        inAppMembershipIds = listOf(
            UUID.nameUUIDFromBytes("target-1".toByteArray()),
            UUID.nameUUIDFromBytes("target-2".toByteArray()),
            UUID.nameUUIDFromBytes("target-3".toByteArray()),
        ),
        emailMembershipIds = listOf(
            UUID.nameUUIDFromBytes("target-1".toByteArray()),
            UUID.nameUUIDFromBytes("target-2".toByteArray()),
        ),
    )
```

In `HostManualNotificationServiceTest.FakeManualPort`, implement `confirmManualDispatch` by returning the same stored dispatch for the same preview:

```kotlin
private val confirmedByPreview = mutableMapOf<UUID, ManualNotificationConfirmedDispatch>()

override fun confirmManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
    selection: ManualNotificationSelection,
    payload: NotificationEventPayload,
    targetSnapshot: ManualNotificationTargetSnapshot,
    resend: Boolean,
): ManualNotificationConfirmedDispatch? {
    previews[previewId] ?: return null
    return confirmedByPreview.getOrPut(previewId) {
        insertedDispatches += payload
        ManualNotificationConfirmedDispatch(
            manualDispatchId = payload.manualDispatch!!.id,
            eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
            createdAt = OffsetDateTime.of(2026, 5, 13, 9, 1, 0, 0, ZoneOffset.UTC),
            status = ManualNotificationConfirmInsertStatus.CREATED,
        )
    }
}
```

Add:

```kotlin
@Test
fun `confirm includes frozen recipients in manual payload`() {
    val port = FakeManualPort()
    val service = service(port)
    val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

    service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))

    val manual = port.insertedDispatches.single().manualDispatch!!
    assertThat(manual.targetMembershipIds).isNotEmpty
    assertThat(manual.inAppMembershipIds).isNotEmpty
    assertThat(manual.emailMembershipIds).isNotEmpty
}
```

- [ ] **Step 3: Change service confirm to build frozen payload**

In `HostManualNotificationService.confirm`, replace the existing `findPreview` and `insertManualDispatch` block with:

```kotlin
val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
requireNonEmptyAudience(targetSnapshot)
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
val session = manualDispatchPort.findSessionContext(currentHost.clubId, command.selection.sessionId) ?: throw notFound()
val dispatchId = UUID.randomUUID()
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
        targetMembershipIds = targetSnapshot.targetMembershipIds,
        inAppMembershipIds = targetSnapshot.inAppMembershipIds,
        emailMembershipIds = targetSnapshot.emailMembershipIds,
        resend = recent.isNotEmpty(),
        sendMode = command.selection.sendMode,
    ),
)
val stored = manualDispatchPort.confirmManualDispatch(
    previewId = command.previewId,
    clubId = currentHost.clubId,
    hostMembershipId = currentHost.membershipId,
    selectionHash = selectionHash(command.selection),
    now = clock(),
    selection = command.selection,
    payload = payload,
    targetSnapshot = targetSnapshot,
    resend = recent.isNotEmpty(),
) ?: throw previewExpired()
```

Keep the existing `ManualNotificationConfirmResult` mapping from `stored`.

- [ ] **Step 4: Implement adapter transaction**

In `JdbcManualNotificationDispatchAdapter`, implement `confirmManualDispatch` with `@Transactional`.

Use `select ... for update`:

```kotlin
val preview = jdbcTemplate.query(
    """
    select id, club_id, host_membership_id, selection_hash, expires_at, consumed_event_id
    from notification_manual_dispatch_previews
    where id = ?
      and club_id = ?
      and host_membership_id = ?
    for update
    """.trimIndent(),
    { rs, _ -> LockedPreview(
        id = rs.uuid("id"),
        selectionHash = rs.getString("selection_hash"),
        expiresAt = rs.utcOffsetDateTime("expires_at"),
        consumedEventId = rs.getString("consumed_event_id")?.let(UUID::fromString),
    ) },
    previewId.dbString(),
    clubId.dbString(),
    hostMembershipId.dbString(),
).firstOrNull() ?: return null
```

Return `null` if expired or hash mismatch:

```kotlin
if (preview.expiresAt.isBefore(now) || preview.selectionHash != selectionHash) return null
```

If already consumed, return the existing manual dispatch:

```kotlin
preview.consumedEventId?.let { eventId ->
    return findStoredDispatchByEventId(clubId, eventId)?.copy(status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
}
```

Insert the outbox with preview-id dedupe key:

```kotlin
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
    "manual:${selection.eventType}:${selection.sessionId}:preview:$previewId",
)
```

Insert the audit row with `preview_id`:

```kotlin
jdbcTemplate.update(
    """
    insert into notification_manual_dispatches (
      id, club_id, event_id, preview_id, session_id, event_type, requested_by_membership_id,
      requested_channels, audience, excluded_count, included_count, target_count,
      expected_in_app_count, expected_email_count, resend, send_mode
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """.trimIndent(),
    dispatchId.dbString(),
    clubId.dbString(),
    eventId.dbString(),
    previewId.dbString(),
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
```

Mark consumed:

```kotlin
jdbcTemplate.update(
    """
    update notification_manual_dispatch_previews
    set consumed_at = utc_timestamp(6),
        consumed_event_id = ?
    where id = ?
      and club_id = ?
      and host_membership_id = ?
      and consumed_event_id is null
    """.trimIndent(),
    eventId.dbString(),
    previewId.dbString(),
    clubId.dbString(),
    hostMembershipId.dbString(),
)
```

Add `findStoredDispatchByEventId`:

```kotlin
private fun findStoredDispatchByEventId(clubId: UUID, eventId: UUID): ManualNotificationConfirmedDispatch? =
    jdbcTemplate.query(
        """
        select id, event_id, created_at
        from notification_manual_dispatches
        where club_id = ?
          and event_id = ?
        """.trimIndent(),
        { rs, _ ->
            ManualNotificationConfirmedDispatch(
                manualDispatchId = rs.uuid("id"),
                eventId = rs.uuid("event_id"),
                createdAt = rs.utcOffsetDateTime("created_at"),
                status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED,
            )
        },
        clubId.dbString(),
        eventId.dbString(),
    ).firstOrNull()
```

- [ ] **Step 5: Add adapter idempotency tests**

In `JdbcManualNotificationDispatchAdapterTest`, add:

```kotlin
@Test
fun `confirmManualDispatch consumes preview once and returns existing dispatch on retry`() {
    val previewId = adapter.insertPreview(
        clubId,
        hostMembershipId,
        "a".repeat(64),
        OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
    )
    val snapshot = adapter.previewTargets(clubId, selection())
    val payload = NotificationEventPayload(
        sessionId = sessionId,
        sessionNumber = 7,
        bookTitle = "Example Book",
        manualDispatch = NotificationManualDispatchPayload(
            id = UUID.nameUUIDFromBytes("manual-dispatch-idempotent".toByteArray()),
            source = NotificationDispatchSource.MANUAL,
            requestedByMembershipId = hostMembershipId,
            requestedChannels = ManualNotificationRequestedChannels.BOTH,
            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
            targetMembershipIds = snapshot.targetMembershipIds,
            inAppMembershipIds = snapshot.inAppMembershipIds,
            emailMembershipIds = snapshot.emailMembershipIds,
            resend = false,
            sendMode = ManualNotificationSendMode.NOW,
        ),
    )

    val first = adapter.confirmManualDispatch(
        previewId = previewId,
        clubId = clubId,
        hostMembershipId = hostMembershipId,
        selectionHash = "a".repeat(64),
        now = OffsetDateTime.now(ZoneOffset.UTC),
        selection = selection(),
        payload = payload,
        targetSnapshot = snapshot,
        resend = false,
    )
    val second = adapter.confirmManualDispatch(
        previewId = previewId,
        clubId = clubId,
        hostMembershipId = hostMembershipId,
        selectionHash = "a".repeat(64),
        now = OffsetDateTime.now(ZoneOffset.UTC),
        selection = selection(),
        payload = payload.copy(
            manualDispatch = payload.manualDispatch!!.copy(id = UUID.randomUUID()),
        ),
        targetSnapshot = snapshot,
        resend = false,
    )

    assertThat(first!!.eventId).isEqualTo(second!!.eventId)
    assertThat(eventCount(first.eventId)).isEqualTo(1)
    assertThat(
        jdbcTemplate.queryForObject(
            "select count(*) from notification_manual_dispatches where preview_id = ?",
            Int::class.java,
            previewId.toString(),
        ),
    ).isEqualTo(1)
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest' --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS.

---

## Task 6: Use Frozen Snapshots in Delivery Planning

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`

- [ ] **Step 1: Add failing delivery planning tests**

Add a test that a new member after event creation is excluded from manual snapshot:

```kotlin
@Test
fun `manual dispatch planning uses frozen recipient snapshot instead of recomputing audience`() {
    val manualEventId = UUID.nameUUIDFromBytes("manual-event-frozen".toByteArray())
    val member1 = membershipIdForEmail("member1@example.com")
    insertManualEventOutboxRow(
        eventId = manualEventId,
        requestedChannels = "BOTH",
        audience = "ALL_ACTIVE_MEMBERS",
        targetMembershipIds = listOf(member1),
        inAppMembershipIds = listOf(member1),
        emailMembershipIds = listOf(member1),
    )
    val newlyJoinedMember = insertActiveMember("joined.after.event.manual")
    try {
        val deliveries = deliveryAdapter.persistPlannedDeliveries(
            message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
        )

        assertThat(deliveries.map { it.recipientMembershipId }).contains(member1)
        assertThat(deliveries.map { it.recipientMembershipId }).doesNotContain(newlyJoinedMember.membershipId)
        assertThat(memberNotificationRows(manualEventId)).isEqualTo(1)
    } finally {
        deleteInsertedMember(newlyJoinedMember)
    }
}
```

Update `insertManualEventOutboxRow` to accept snapshot lists:

```kotlin
private fun insertManualEventOutboxRow(
    eventId: UUID,
    requestedChannels: String,
    audience: String,
    excludedMembershipIds: List<UUID> = emptyList(),
    includedMembershipIds: List<UUID> = emptyList(),
    targetMembershipIds: List<UUID> = emptyList(),
    inAppMembershipIds: List<UUID> = emptyList(),
    emailMembershipIds: List<UUID> = emptyList(),
)
```

In the JSON object add:

```sql
'targetMembershipIds', cast(? as json),
'inAppMembershipIds', cast(? as json),
'emailMembershipIds', cast(? as json),
```

Pass JSON strings for all three lists.

- [ ] **Step 2: Run delivery adapter tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest'
```

Expected: FAIL because manual planning still recomputes audience and includes the newly joined member.

- [ ] **Step 3: Add frozen recipient path**

In `NotificationDeliveryPlanningOperations.manualRecipients`, branch on snapshot presence:

```kotlin
private fun manualRecipients(
    jdbcTemplate: JdbcTemplate,
    message: NotificationEventMessage,
): List<DeliveryRecipient> {
    val manual = requireNotNull(message.payload.manualDispatch)
    if (manual.targetMembershipIds.isNotEmpty() || manual.inAppMembershipIds.isNotEmpty() || manual.emailMembershipIds.isNotEmpty()) {
        return frozenManualRecipients(jdbcTemplate, message)
    }
    return legacyManualRecipients(jdbcTemplate, message)
}
```

Move the existing body into `legacyManualRecipients`.

Implement frozen recipients:

```kotlin
private fun frozenManualRecipients(
    jdbcTemplate: JdbcTemplate,
    message: NotificationEventMessage,
): List<DeliveryRecipient> {
    val manual = requireNotNull(message.payload.manualDispatch)
    val finalIds = manual.targetMembershipIds.distinct()
    if (finalIds.isEmpty()) return emptyList()
    val placeholders = finalIds.joinToString(",") { "?" }
    val emailIds = manual.emailMembershipIds.toSet()
    val emailPredicate = if (emailIds.isEmpty()) {
        "false"
    } else {
        "memberships.id in (${emailIds.joinToString(",") { "?" }})"
    }
    val args = if (emailIds.isEmpty()) {
        listOf(message.clubId.dbString() as Any) + finalIds.map { it.dbString() as Any }
    } else {
        emailIds.map { it.dbString() as Any } + listOf(message.clubId.dbString() as Any) + finalIds.map { it.dbString() as Any }
    }
    return jdbcTemplate.query(
        """
        select
          memberships.id as recipient_membership_id,
          coalesce(memberships.short_name, users.name) as display_name,
          (
            users.email is not null
            and users.email <> ''
            and $emailPredicate
          ) as email_allowed
        from memberships
        join users on users.id = memberships.user_id
        where memberships.club_id = ?
          and memberships.status = 'ACTIVE'
          and memberships.id in ($placeholders)
        """.trimIndent(),
        { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
        *args.toTypedArray(),
    )
}
```

- [ ] **Step 4: Respect frozen in-app ids when creating rows**

Change `deliveryRowsForRecipient` to use snapshot channel sets:

```kotlin
val manual = message.payload.manualDispatch
val requested = manual?.requestedChannels
val frozenInAppIds = manual?.inAppMembershipIds?.toSet().orEmpty()
val frozenEmailIds = manual?.emailMembershipIds?.toSet().orEmpty()
val hasFrozenSnapshot = manual != null && (
    manual.targetMembershipIds.isNotEmpty() ||
    manual.inAppMembershipIds.isNotEmpty() ||
    manual.emailMembershipIds.isNotEmpty()
)
val includeInApp = if (hasFrozenSnapshot) {
    recipient.membershipId in frozenInAppIds
} else {
    requested == null || requested == ManualNotificationRequestedChannels.IN_APP || requested == ManualNotificationRequestedChannels.BOTH
}
val includeEmail = if (hasFrozenSnapshot) {
    recipient.membershipId in frozenEmailIds
} else {
    requested == null || requested == ManualNotificationRequestedChannels.EMAIL || requested == ManualNotificationRequestedChannels.BOTH
}
```

Keep `recipient.emailAllowed` for email status so missing current email becomes `SKIPPED`.

- [ ] **Step 5: Run delivery adapter tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest'
```

Expected: PASS.

---

## Task 7: Align Frontend Manual Template Conditions

**Files:**
- Modify: `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Test: `front/tests/unit/host-session-notifications.test.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing unit tests**

In `host-session-notifications.test.tsx`, assert that next book is disabled for an `OPEN` session even if visibility is `MEMBER`, and feedback is disabled for `OPEN` even when a document exists.

Use the existing render helper and expect no enabled link for those labels:

```ts
expect(screen.getByRole("button", { name: /다음 책 공개/ })).toBeDisabled();
expect(screen.getByRole("button", { name: /피드백 문서 등록/ })).toBeDisabled();
```

- [ ] **Step 2: Run focused frontend tests and verify failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-notifications.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/host-notifications.test.tsx
```

Expected: FAIL because current session-editor conditions are looser.

- [ ] **Step 3: Update `HostSessionNotificationActions`**

Change the actions:

```ts
{
  eventType: "NEXT_BOOK_PUBLISHED",
  label: "다음 책 공개",
  enabled: state === "DRAFT" && (visibility === "MEMBER" || visibility === "PUBLIC"),
  disabledReason: "멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다.",
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
  enabled: (state === "CLOSED" || state === "PUBLISHED") && feedbackDocumentUploaded,
  disabledReason: "닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.",
},
```

- [ ] **Step 4: Harden confirm pending UI**

In `manual-notification-workbench.tsx`, keep the existing `busy` derived disabled state. Ensure confirm callback cannot be fired when `canConfirm` is false:

```tsx
onConfirm={() => {
  if (!canConfirm) return;
  void onConfirm({ ...selection, previewId: preview.previewId, resendConfirmed });
}}
```

If `ManualNotificationPreviewPanel` owns the button click, pass a no-op guarded handler:

```tsx
onConfirm={canConfirm ? () => onConfirm({ ...selection, previewId: preview.previewId, resendConfirmed }) : () => undefined}
```

- [ ] **Step 5: Run frontend unit tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-notifications.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/host-notifications.test.tsx
```

Expected: PASS.

---

## Task 8: Add E2E Coverage for Idempotency and Predicate Alignment

**Files:**
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`

- [ ] **Step 1: Update manual notification cleanup order**

In `cleanupManualNotificationArtifacts`, keep the first `delete from notification_manual_dispatches` statement where it is, then move the final preview cleanup so it runs before `delete from notification_event_outbox`:

```ts
delete from notification_manual_dispatch_previews
where club_id = ${sqlString(clubId)};

delete from notification_event_outbox
where club_id = ${sqlString(clubId)}
  and dedupe_key like 'manual:%';
```

The order is required because consumed previews now hold a nullable foreign key to `notification_event_outbox`.

- [ ] **Step 2: Add DB helper for manual event counts**

In `readmates-e2e-db.ts`, add:

```ts
export function countManualNotificationEventsForSession(sessionId: string, eventType: string) {
  const output = runMysql(`
    select count(*) as count
    from notification_manual_dispatches
    where session_id = ${sqlString(sessionId)}
      and event_type = ${sqlString(eventType)};
  `);
  const [, count] = output.trim().split(/\s+/);
  return Number(count ?? 0);
}
```

- [ ] **Step 3: Add E2E for double confirm safety**

In `manual-notifications.spec.ts`, add a test that opens the workbench, previews, clicks confirm twice or retries the confirm request, then asserts count is 1. Use existing login/setup helpers from the file.

Core assertion:

```ts
expect(countManualNotificationEventsForSession(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
```

- [ ] **Step 4: Add E2E for disabled predicates**

Add a flow that visits a non-DRAFT open session and verifies `다음 책 공개` is not an enabled action. Add a flow for an OPEN session with feedback document where `피드백 문서 등록` is disabled until the session is CLOSED/PUBLISHED.

- [ ] **Step 5: Run manual notification E2E**

Run:

```bash
pnpm --dir front test:e2e -- manual-notifications.spec.ts
```

Expected: PASS. If the project E2E command does not accept a file filter, run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

---

## Task 9: Fix Existing Docs Whitespace Regression

**Files:**
- Modify: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md`
- Modify: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md`

- [ ] **Step 1: Locate trailing whitespace**

Run:

```bash
git diff --check 7406fe3..HEAD
```

Expected before fix: trailing whitespace on the two manual notification spec files.

- [ ] **Step 2: Remove only trailing spaces on reported lines**

Do not rewrite the historical docs. Remove the spaces at the ends of the reported lines only.

- [ ] **Step 3: Verify whitespace**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md docs/superpowers/specs/2026-05-14-readmates-manual-notification-hardening-spec.md docs/superpowers/plans/2026-05-14-readmates-manual-notification-hardening-detailed-implementation.md
```

Expected: no output.

---

## Task 10: Final Verification

**Files:**
- No planned edits.

- [ ] **Step 1: Run focused server tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest' --tests 'com.readmates.notification.application.model.NotificationManualDispatchModelsTest' --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest' --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest' --tests 'com.readmates.notification.api.HostNotificationControllerTest'
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx tests/unit/host-session-notifications.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run E2E for manual notifications**

Run:

```bash
pnpm --dir front test:e2e -- manual-notifications.spec.ts
```

Expected: PASS. If filtering is unsupported, run the whole command and record that broader result.

- [ ] **Step 4: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md docs/superpowers/specs/2026-05-14-readmates-manual-notification-hardening-spec.md docs/superpowers/plans/2026-05-14-readmates-manual-notification-hardening-detailed-implementation.md
```

Expected: no output.

- [ ] **Step 5: Run broader checks if this is the final pre-merge patch**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Expected: PASS. If a broad check is skipped because the requested scope is limited, note the skipped command and reason in the final response.

---

## Self-Review Checklist

- [ ] The spec's three hardening goals map to tasks:
  - Frozen recipients: Tasks 2, 4, 6.
  - Preview idempotency: Tasks 1, 5, 8.
  - Template predicate alignment: Tasks 3, 7, 8.
- [ ] No public API response exposes frozen membership ids or raw emails.
- [ ] New migration is nullable and compatible with existing manual dispatch rows.
- [ ] New payload fields default to empty lists for old JSON payloads.
- [ ] Delivery planner keeps a legacy fallback for snapshot-less manual payloads.
- [ ] Confirm checks duplicates before consuming preview.
- [ ] Outbox dedupe key uses preview id, not a random dispatch id.
- [ ] Frontend conditions match server disabled conditions.
- [ ] Docs whitespace check includes both new docs and previously failing manual notification docs.
