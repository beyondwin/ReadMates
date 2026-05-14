# ReadMates Post-v1.8.3 Risk Remediation Detailed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement transaction-safe manual notification confirms, stale-preview frontend protection, server check-lane cleanup, and release hygiene fixes identified after `v1.8.3`.

**Architecture:** Keep server orchestration in `notification.application.service`, persistence in `notification.adapter.out.persistence`, and HTTP DTOs unchanged unless a public contract needs an additive field. Keep frontend route state in `HostNotificationsPage`; `ManualNotificationWorkbench` remains a controlled UI component driven by props and callbacks.

**Tech Stack:** Kotlin/Spring Boot, JDBC, MySQL/Flyway, JUnit 5, AssertJ, React/Vite, TypeScript, Vitest/Testing Library, Playwright, Gradle/Jacoco.

---

## Source Documents

- Plan brief: `docs/superpowers/plans/2026-05-15-readmates-post-v1.8.3-risk-remediation-plan.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`

## File Map

### Server

- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
  - Add stored confirm summary to `ManualNotificationConfirmedDispatch`.
  - Replace insert-only status with `ManualNotificationConfirmStatus`.
  - Add `ManualNotificationConfirmAttempt`.
  - Change `confirmManualDispatch` to accept `resendConfirmed`.
  - Remove `insertManualDispatch`.
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
  - Lookup consumed preview before live validation.
  - Let persistence make the duplicate/resend decision under lock.
  - Return stored confirm summary without recomputing live targets for consumed retries.
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
  - Map stored confirm summary from `notification_manual_dispatches`.
  - Lock the session row and check duplicate existence inside `confirmManualDispatch`.
  - Serialize outbox payload with transaction-computed `resend`.
  - Remove `insertManualDispatch`.
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

### Frontend

- Modify: `front/features/host/ui/host-notifications-page.tsx`
  - Add `handleManualSelectionChange`.
  - Pass it to `ManualNotificationWorkbench`.
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Add `onSelectionChange` prop.
  - Use a local selection-change helper for all non-session selection mutations.
  - Clear resend confirmation when selection changes.
- Test: `front/tests/unit/host-notifications.test.tsx`
- Test: `front/tests/e2e/manual-notifications.spec.ts`

### Build and Docs

- Modify: `server/build.gradle.kts`
  - Make default `test` exclude `architecture`.
  - Make Jacoco report/verification consume default `test` execution data.
  - Keep `unitTest`, `integrationTest`, and `architectureTest` as explicit fast lanes.
- Modify: `docs/development/test-guide.md`
  - Document backend lane responsibilities.
- Modify: `docs/superpowers/plans/2026-05-14-front-tsconfig-modernize.md`
  - Remove trailing whitespace at the known failing line.
- Modify: `CHANGELOG.md`
  - Replace the Unreleased verification placeholder with the actual fresh command results after all checks pass.

---

## Task 1: Store Confirm Summary and Make Consumed Retry Independent of Live State

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Add the failing service test**

In `HostManualNotificationServiceTest`, make the fake port's `sessionContext` mutable:

```kotlin
private class FakeManualPort(
    var sessionContext: ManualNotificationSessionContext =
        ManualNotificationSessionContext(
            sessionId = SESSION_ID,
            clubId = CLUB_ID,
            sessionNumber = 7,
            bookTitle = "Example Book",
            date = LocalDate.of(2026, 5, 14),
            state = "DRAFT",
            visibility = "MEMBER",
            feedbackDocumentUploaded = true,
        ),
    private val recentDispatchCount: Int = 0,
    private val membershipEditsAllowed: Boolean = true,
) : ManualNotificationDispatchPort {
```

Add this test near the existing confirm retry test:

```kotlin
@Test
fun `confirm retry for consumed preview returns stored summary before live validation`() {
    val port = FakeManualPort()
    val service = service(port)
    val previewId = service.preview(host(), ManualNotificationPreviewCommand(selection())).previewId

    val first = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))
    port.sessionContext = port.sessionContext.copy(state = "CLOSED")

    val second = service.confirm(host(), ManualNotificationConfirmCommand(previewId, selection(), resendConfirmed = false))

    assertThat(second.eventId).isEqualTo(first.eventId)
    assertThat(second.manualDispatchId).isEqualTo(first.manualDispatchId)
    assertThat(second.summary).isEqualTo(first.summary)
    assertThat(port.insertedDispatches).hasSize(1)
}
```

- [ ] **Step 2: Run the targeted service test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
```

Expected: the new test fails because `confirm` still calls `validateSelection` before returning the consumed dispatch.

- [ ] **Step 3: Extend confirm port models**

In `ManualNotificationDispatchPort.kt`, add the summary import:

```kotlin
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
```

Replace `ManualNotificationConfirmInsertStatus` and `ManualNotificationConfirmedDispatch` with:

```kotlin
enum class ManualNotificationConfirmStatus {
    CREATED,
    ALREADY_CONSUMED,
    DUPLICATE_REQUIRES_RESEND,
}

data class ManualNotificationConfirmedDispatch(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val createdAt: OffsetDateTime,
    val status: ManualNotificationConfirmStatus,
    val summary: ManualNotificationConfirmSummary,
)

data class ManualNotificationConfirmAttempt(
    val status: ManualNotificationConfirmStatus,
    val dispatch: ManualNotificationConfirmedDispatch? = null,
)
```

- [ ] **Step 4: Change the confirm port signature**

In `ManualNotificationDispatchPort.kt`, change `confirmManualDispatch` to:

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
    resendConfirmed: Boolean,
): ManualNotificationConfirmAttempt?
```

Leave `findConsumedManualDispatch` returning `ManualNotificationConfirmedDispatch?`.

- [ ] **Step 5: Update service confirm ordering**

In `HostManualNotificationService.confirm`, compute the hash first, return consumed previews before live validation, and handle the new attempt status:

```kotlin
override fun confirm(
    host: CurrentMember,
    command: ManualNotificationConfirmCommand,
): ManualNotificationConfirmResult {
    val currentHost = requireHost(host)
    val selectionHash = selectionHash(command.selection)
    manualDispatchPort
        .findConsumedManualDispatch(
            previewId = command.previewId,
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            selectionHash = selectionHash,
            now = clock(),
        )?.let { stored ->
            return confirmResult(stored)
        }

    validateSelection(currentHost, command.selection)
    val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
    requireNonEmptyAudience(targetSnapshot)
    val session = manualDispatchPort.findSessionContext(currentHost.clubId, command.selection.sessionId) ?: throw notFound()
    val dispatchId = UUID.randomUUID()
    val payload =
        NotificationEventPayload(
            sessionId = command.selection.sessionId,
            sessionNumber = session.sessionNumber,
            bookTitle = session.bookTitle,
            manualDispatch =
                NotificationManualDispatchPayload(
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
                    resend = false,
                    sendMode = command.selection.sendMode,
                ),
        )
    val attempt =
        manualDispatchPort.confirmManualDispatch(
            previewId = command.previewId,
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            selectionHash = selectionHash,
            now = clock(),
            selection = command.selection,
            payload = payload,
            targetSnapshot = targetSnapshot,
            resendConfirmed = command.resendConfirmed,
        ) ?: throw previewExpired()
    if (attempt.status == ManualNotificationConfirmStatus.DUPLICATE_REQUIRES_RESEND) {
        throw NotificationApplicationException(
            NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH,
            "Manual notification dispatch already exists for session/template",
        )
    }
    return confirmResult(requireNotNull(attempt.dispatch) { "Manual notification confirm dispatch is required" })
}
```

Add the new import:

```kotlin
import com.readmates.notification.application.port.out.ManualNotificationConfirmStatus
```

Replace `confirmResult` with the stored-summary version:

```kotlin
private fun confirmResult(stored: ManualNotificationConfirmedDispatch): ManualNotificationConfirmResult =
    ManualNotificationConfirmResult(
        manualDispatchId = stored.manualDispatchId,
        eventId = stored.eventId,
        status = NotificationEventOutboxStatus.PENDING,
        createdAt = stored.createdAt,
        summary = stored.summary,
    )
```

- [ ] **Step 6: Update the fake port**

In `HostManualNotificationServiceTest.FakeManualPort`, change `confirmedByPreview` and `confirmManualDispatch` to build stored summaries:

```kotlin
private val confirmedByPreview = mutableMapOf<UUID, ManualNotificationConfirmedDispatch>()
```

```kotlin
override fun findConsumedManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
): ManualNotificationConfirmedDispatch? {
    val preview = previews[previewId] ?: return null
    if (preview.selectionHash != selectionHash) return null
    return confirmedByPreview[previewId]
        ?.copy(status = ManualNotificationConfirmStatus.ALREADY_CONSUMED)
}
```

```kotlin
override fun confirmManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
    selection: ManualNotificationSelection,
    payload: NotificationEventPayload,
    targetSnapshot: ManualNotificationTargetSnapshot,
    resendConfirmed: Boolean,
): ManualNotificationConfirmAttempt? {
    previews[previewId] ?: return null
    val stored =
        confirmedByPreview.getOrPut(previewId) {
            insertedDispatches += payload
            ManualNotificationConfirmedDispatch(
                manualDispatchId = payload.manualDispatch!!.id,
                eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                createdAt = OffsetDateTime.of(2026, 5, 13, 9, 1, 0, 0, ZoneOffset.UTC),
                status = ManualNotificationConfirmStatus.CREATED,
                summary =
                    ManualNotificationConfirmSummary(
                        targetCount = targetSnapshot.finalTargetCount,
                        requestedChannels = selection.requestedChannels,
                        expectedInAppCount = targetSnapshot.inAppEligibleCount,
                        expectedEmailCount = targetSnapshot.emailEligibleCount,
                    ),
            )
        }
    return ManualNotificationConfirmAttempt(stored.status, stored)
}
```

- [ ] **Step 7: Update persistence mapping for stored summaries**

In `JdbcManualNotificationDispatchAdapter.kt`, add imports:

```kotlin
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmStatus
```

Update `findConsumedManualDispatch` so consumed retries do not depend on expiry:

```kotlin
override fun findConsumedManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
): ManualNotificationConfirmedDispatch? =
    jdbcTemplate
        .query(
            """
            select
              notification_manual_dispatches.id,
              notification_manual_dispatches.event_id,
              notification_manual_dispatches.created_at,
              notification_manual_dispatches.requested_channels,
              notification_manual_dispatches.target_count,
              notification_manual_dispatches.expected_in_app_count,
              notification_manual_dispatches.expected_email_count
            from notification_manual_dispatch_previews
            join notification_manual_dispatches on notification_manual_dispatches.event_id = notification_manual_dispatch_previews.consumed_event_id
              and notification_manual_dispatches.club_id = notification_manual_dispatch_previews.club_id
            where notification_manual_dispatch_previews.id = ?
              and notification_manual_dispatch_previews.club_id = ?
              and notification_manual_dispatch_previews.host_membership_id = ?
              and notification_manual_dispatch_previews.selection_hash = ?
              and notification_manual_dispatch_previews.consumed_event_id is not null
            """.trimIndent(),
            { rs, _ -> rs.toConfirmedDispatch(ManualNotificationConfirmStatus.ALREADY_CONSUMED) },
            previewId.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
            selectionHash,
        ).firstOrNull()
```

Add this mapper near the existing row mappers:

```kotlin
private fun ResultSet.toConfirmedDispatch(status: ManualNotificationConfirmStatus) =
    ManualNotificationConfirmedDispatch(
        manualDispatchId = uuid("id"),
        eventId = uuid("event_id"),
        createdAt = utcOffsetDateTime("created_at"),
        status = status,
        summary =
            ManualNotificationConfirmSummary(
                targetCount = getInt("target_count"),
                requestedChannels = ManualNotificationRequestedChannels.valueOf(getString("requested_channels")),
                expectedInAppCount = getInt("expected_in_app_count"),
                expectedEmailCount = getInt("expected_email_count"),
            ),
    )
```

- [ ] **Step 8: Run the targeted service test**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
```

Expected: PASS.

---

## Task 2: Move Duplicate Guard Inside the Confirm Transaction

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`

- [ ] **Step 1: Add persistence tests for duplicate decision**

In `JdbcManualNotificationDispatchAdapterTest`, add:

```kotlin
@Test
fun `confirmManualDispatch returns duplicate status inside transaction when resend is not confirmed`() {
    val existing = insertManualDispatchFixture()
    val previewId =
        adapter.insertPreview(
            clubId,
            hostMembershipId,
            "b".repeat(64),
            OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
        )
    val snapshot = adapter.previewTargets(clubId, selection())
    val payload = manualPayload("manual-dispatch-duplicate-blocked", snapshot, resend = false)

    val attempt =
        adapter.confirmManualDispatch(
            previewId = previewId,
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = "b".repeat(64),
            now = OffsetDateTime.now(ZoneOffset.UTC),
            selection = selection(),
            payload = payload,
            targetSnapshot = snapshot,
            resendConfirmed = false,
        )

    assertThat(attempt!!.status).isEqualTo(ManualNotificationConfirmStatus.DUPLICATE_REQUIRES_RESEND)
    assertThat(attempt.dispatch).isNull()
    assertThat(eventCount(existing.eventId)).isEqualTo(1)
    assertThat(previewManualDispatchCount(previewId)).isEqualTo(0)
}

@Test
fun `confirmManualDispatch allows duplicate when resend is confirmed and stores resend flag`() {
    insertManualDispatchFixture()
    val previewId =
        adapter.insertPreview(
            clubId,
            hostMembershipId,
            "c".repeat(64),
            OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
        )
    val snapshot = adapter.previewTargets(clubId, selection())
    val payload = manualPayload("manual-dispatch-duplicate-resend", snapshot, resend = false)

    val attempt =
        adapter.confirmManualDispatch(
            previewId = previewId,
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = "c".repeat(64),
            now = OffsetDateTime.now(ZoneOffset.UTC),
            selection = selection(),
            payload = payload,
            targetSnapshot = snapshot,
            resendConfirmed = true,
        )

    assertThat(attempt!!.status).isEqualTo(ManualNotificationConfirmStatus.CREATED)
    assertThat(previewManualDispatchCount(previewId)).isEqualTo(1)
    assertThat(manualDispatchResend(attempt.dispatch!!.manualDispatchId)).isTrue()
}
```

Add helper functions in the same test class:

```kotlin
private fun manualPayload(
    idSeed: String,
    snapshot: ManualNotificationTargetSnapshot,
    resend: Boolean,
) = NotificationEventPayload(
    sessionId = sessionId,
    sessionNumber = 7,
    bookTitle = "Example Book",
    manualDispatch =
        NotificationManualDispatchPayload(
            id = UUID.nameUUIDFromBytes(idSeed.toByteArray()),
            source = NotificationDispatchSource.MANUAL,
            requestedByMembershipId = hostMembershipId,
            requestedChannels = ManualNotificationRequestedChannels.BOTH,
            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
            targetMembershipIds = snapshot.targetMembershipIds,
            inAppMembershipIds = snapshot.inAppMembershipIds,
            emailMembershipIds = snapshot.emailMembershipIds,
            resend = resend,
            sendMode = ManualNotificationSendMode.NOW,
        ),
)

private fun manualDispatchResend(dispatchId: UUID): Boolean =
    jdbcTemplate.queryForObject(
        "select resend from notification_manual_dispatches where id = ?",
        Boolean::class.java,
        dispatchId.toString(),
    )!!
```

- [ ] **Step 2: Run the persistence test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: FAIL because the adapter still inserts when a duplicate exists and `resendConfirmed=false`.

- [ ] **Step 3: Add session lock and duplicate helpers**

In `JdbcManualNotificationDispatchAdapter.kt`, add:

```kotlin
private fun lockSessionForManualConfirm(
    clubId: UUID,
    sessionId: UUID,
): Boolean =
    jdbcTemplate
        .query(
            """
            select id
            from sessions
            where club_id = ?
              and id = ?
            for update
            """.trimIndent(),
            { rs, _ -> rs.uuid("id") },
            clubId.dbString(),
            sessionId.dbString(),
        ).isNotEmpty()

private fun manualDispatchExists(
    clubId: UUID,
    sessionId: UUID,
    eventType: NotificationEventType,
): Boolean =
    jdbcTemplate.queryForObject(
        """
        select exists(
          select 1
          from notification_manual_dispatches
          where club_id = ?
            and session_id = ?
            and event_type = ?
        )
        """.trimIndent(),
        Boolean::class.java,
        clubId.dbString(),
        sessionId.dbString(),
        eventType.name,
    ) == true
```

- [ ] **Step 4: Update `confirmManualDispatch` transaction**

Inside `confirmManualDispatch`, after the consumed-preview check and before generating `eventId`, add:

```kotlin
if (!lockSessionForManualConfirm(clubId, selection.sessionId)) return null
val duplicateExists = manualDispatchExists(clubId, selection.sessionId, selection.eventType)
if (duplicateExists && !resendConfirmed) {
    return ManualNotificationConfirmAttempt(ManualNotificationConfirmStatus.DUPLICATE_REQUIRES_RESEND)
}
```

Before `objectMapper.writeValueAsString(payload)`, compute the final payload:

```kotlin
val eventId = UUID.randomUUID()
val manualDispatch = requireNotNull(payload.manualDispatch) { "Manual dispatch payload is required" }
val dispatchId = manualDispatch.id
val storedPayload =
    payload.copy(
        manualDispatch = manualDispatch.copy(resend = duplicateExists),
    )
```

Use `storedPayload` in the outbox insert:

```kotlin
objectMapper.writeValueAsString(storedPayload),
```

Use `duplicateExists` in the manual dispatch insert:

```kotlin
duplicateExists,
```

Return the structured attempt:

```kotlin
return ManualNotificationConfirmAttempt(
    status = ManualNotificationConfirmStatus.CREATED,
    dispatch =
        ManualNotificationConfirmedDispatch(
            manualDispatchId = dispatchId,
            eventId = eventId,
            createdAt = createdAt,
            status = ManualNotificationConfirmStatus.CREATED,
            summary =
                ManualNotificationConfirmSummary(
                    targetCount = targetSnapshot.finalTargetCount,
                    requestedChannels = selection.requestedChannels,
                    expectedInAppCount = targetSnapshot.inAppEligibleCount,
                    expectedEmailCount = targetSnapshot.emailEligibleCount,
                ),
        ),
)
```

When returning an already consumed dispatch inside the transaction, wrap it:

```kotlin
preview.consumedEventId?.let { eventId ->
    val stored =
        findStoredDispatchByEventId(clubId, eventId)
            ?.copy(status = ManualNotificationConfirmStatus.ALREADY_CONSUMED)
    return stored?.let { ManualNotificationConfirmAttempt(ManualNotificationConfirmStatus.ALREADY_CONSUMED, it) }
}
```

- [ ] **Step 5: Update `findStoredDispatchByEventId`**

Change its select list and mapper:

```kotlin
select
  id,
  event_id,
  created_at,
  requested_channels,
  target_count,
  expected_in_app_count,
  expected_email_count
from notification_manual_dispatches
where club_id = ?
  and event_id = ?
```

Use:

```kotlin
{ rs, _ -> rs.toConfirmedDispatch(ManualNotificationConfirmStatus.ALREADY_CONSUMED) }
```

- [ ] **Step 6: Update service duplicate tests**

In `HostManualNotificationServiceTest.FakeManualPort.confirmManualDispatch`, return duplicate status when fake recent dispatches exist and the caller did not confirm resend:

```kotlin
if ((recentDispatchCount + insertedDispatches.size) > 0 && !resendConfirmed) {
    return ManualNotificationConfirmAttempt(ManualNotificationConfirmStatus.DUPLICATE_REQUIRES_RESEND)
}
```

When adding inserted payloads, store the final resend flag:

```kotlin
val storedPayload =
    payload.copy(
        manualDispatch = payload.manualDispatch!!.copy(resend = (recentDispatchCount + insertedDispatches.size) > 0),
    )
insertedDispatches += storedPayload
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: both commands pass.

---

## Task 3: Remove the Production Bypass Insert Method

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`

- [ ] **Step 1: Remove `insertManualDispatch` from the port**

Delete this method from `ManualNotificationDispatchPort`:

```kotlin
fun insertManualDispatch(
    clubId: UUID,
    hostMembershipId: UUID,
    selection: ManualNotificationSelection,
    payload: NotificationEventPayload,
    targetSnapshot: ManualNotificationTargetSnapshot,
    resend: Boolean,
): ManualNotificationStoredDispatch
```

Delete `ManualNotificationStoredDispatch` if no production code still uses it.

- [ ] **Step 2: Remove the adapter implementation**

Delete `JdbcManualNotificationDispatchAdapter.insertManualDispatch`.

- [ ] **Step 3: Replace persistence fixture setup with preview confirm**

Replace `insertManualDispatchFixture()` in `JdbcManualNotificationDispatchAdapterTest` with:

```kotlin
private fun insertManualDispatchFixture(): ManualNotificationConfirmedDispatch {
    val selectionHash = UUID.randomUUID().toString().replace("-", "").repeat(2).take(64)
    val previewId =
        adapter.insertPreview(
            clubId,
            hostMembershipId,
            selectionHash,
            OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
        )
    val preview =
        adapter.findPreview(previewId, clubId, hostMembershipId)
            ?: error("Inserted manual notification preview must be readable")
    val snapshot = adapter.previewTargets(clubId, selection())
    val attempt =
        adapter.confirmManualDispatch(
            previewId = previewId,
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = preview.selectionHash,
            now = OffsetDateTime.now(ZoneOffset.UTC),
            selection = selection(),
            payload = manualPayload("manual-dispatch-${previewId}", snapshot, resend = false),
            targetSnapshot = snapshot,
            resendConfirmed = true,
        )
    return requireNotNull(attempt?.dispatch) { "Manual dispatch fixture confirm must create a dispatch" }
}
```

- [ ] **Step 4: Remove fake implementation**

Delete `insertManualDispatch` from `HostManualNotificationServiceTest.FakeManualPort`.

- [ ] **Step 5: Verify no bypass remains**

Run:

```bash
rg -n "insertManualDispatch|ManualNotificationStoredDispatch" server/src/main/kotlin server/src/test/kotlin
```

Expected: no output.

- [ ] **Step 6: Run affected server tests**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS.

---

## Task 4: Clear Stale Frontend Preview on Selection Changes

**Files:**
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing UI test**

In `host-notifications.test.tsx`, add:

```tsx
it("clears manual preview when the host changes the selected channel", async () => {
  const user = userEvent.setup();
  const onPreviewManual = vi.fn().mockResolvedValue({
    previewId: "preview-1",
    expiresAt: "2026-05-15T09:10:00Z",
    template: {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      subject: "모임 전날 리마인더",
      bodyPreview: "모임 전 준비를 확인해 주세요.",
    },
    audience: {
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
      requiresResendConfirmation: false,
      recentDispatches: [],
    },
    warnings: [],
  });

  renderPage({ onPreviewManual, manualOptions: manualOptionsFixture });

  await user.click(screen.getByRole("button", { name: "미리보기" }));
  expect(await screen.findByRole("heading", { name: "발송 전 확인" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "이메일" }));

  expect(screen.queryByRole("heading", { name: "발송 전 확인" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted frontend test and verify failure**

Run:

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: FAIL because the preview panel remains visible after the channel change.

- [ ] **Step 3: Add parent callback**

In `HostNotificationsPage`, add:

```tsx
const handleManualSelectionChange = () => {
  setManualPreview(null);
  setManualError(null);
};
```

Pass it to the workbench:

```tsx
<ManualNotificationWorkbench
  options={visibleManualOptions}
  hostSessions={hostSessions}
  initialSessionId={initialManualSelection.sessionId}
  initialEventType={initialManualSelection.eventType}
  preview={manualPreview}
  busy={manualBusy || isRefreshing}
  error={manualError}
  onPreview={handleManualPreview}
  onConfirm={handleManualConfirm}
  onSelectionChange={handleManualSelectionChange}
  onSessionChange={handleManualSessionChange}
  onLoadManualOptions={handleLoadManualOptions}
  onLoadMoreManualMembers={handleLoadMoreManualMembers}
/>
```

- [ ] **Step 4: Wire selection-change helper in workbench**

In `manual-notification-workbench.tsx`, add the prop:

```tsx
onSelectionChange?: () => void;
```

Destructure it:

```tsx
onSelectionChange,
```

Add this helper after the `sessionHint` calculation:

```tsx
const applySelectionChange = (updater: (current: Selection) => Selection) => {
  setSelection(updater);
  setResendConfirmed(false);
  onSelectionChange?.();
};
```

Use `applySelectionChange` for template, audience, channel, included ids, and excluded ids:

```tsx
applySelectionChange((current) => ({
  ...current,
  eventType: template.eventType,
  audience: template.defaultAudience,
  requestedChannels: template.defaultChannels,
}));
```

```tsx
onClick={() => applySelectionChange((current) => ({ ...current, audience }))}
```

```tsx
onClick={() => applySelectionChange((current) => ({ ...current, requestedChannels: value as ManualNotificationRequestedChannels }))}
```

```tsx
onExcludedIdsChange={(excludedMembershipIds) => applySelectionChange((current) => ({ ...current, excludedMembershipIds }))}
onIncludedIdsChange={(includedMembershipIds) => applySelectionChange((current) => ({ ...current, includedMembershipIds }))}
```

Keep `handleSessionChange` using its existing path because parent session-change already clears preview and reloads options.

- [ ] **Step 5: Run targeted frontend tests**

Run:

```bash
pnpm --dir front test -- host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run E2E manual notification flow**

Run:

```bash
pnpm --dir front test:e2e -- manual-notifications.spec.ts
```

Expected: PASS.

---

## Task 5: Reduce Server Check-Lane Duplication

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Capture current dry run**

Run:

```bash
./server/gradlew -p server check architectureTest --dry-run
```

Expected before implementation: output includes both `:test` and `:unitTest`.

- [ ] **Step 2: Configure default test as unit + integration lane**

In `server/build.gradle.kts`, after `tasks.withType<Test>().configureEach`, add:

```kotlin
val testTask = tasks.named<Test>("test")

testTask.configure {
    useJUnitPlatform {
        excludeTags("architecture")
    }
    extensions.configure<JacocoTaskExtension> {
        destinationFile =
            layout.buildDirectory
                .file("jacoco/test.exec")
                .get()
                .asFile
    }
}
```

- [ ] **Step 3: Point Jacoco at default test data**

Delete:

```kotlin
val unitTestTask = tasks.named<Test>("unitTest")

unitTestTask.configure {
    extensions.configure<JacocoTaskExtension> {
        destinationFile =
            layout.buildDirectory
                .file("jacoco/unitTest.exec")
                .get()
                .asFile
    }
}
```

In `jacocoTestReport`, replace:

```kotlin
dependsOn(unitTestTask)
executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/unitTest.exec"))
```

with:

```kotlin
dependsOn(testTask)
executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/test.exec"))
```

In `jacocoTestCoverageVerification`, replace:

```kotlin
executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/unitTest.exec"))
```

with:

```kotlin
executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/test.exec"))
```

- [ ] **Step 4: Update test guide**

In `docs/development/test-guide.md`, update the backend command section with:

```markdown
`./server/gradlew -p server clean test` runs the default backend verification lane: unit and Spring/Testcontainers integration tests. Architecture tests are intentionally split into `./server/gradlew -p server architectureTest` so CI can report architecture boundary failures separately and local runs can choose the faster lane they need.

`./server/gradlew -p server check` runs ktlint, detekt, the default `test` task, Jacoco report generation, and Jacoco coverage verification. `unitTest` and `integrationTest` remain explicit fast lanes for local feedback, but `check` does not run `unitTest` a second time after default `test`.
```

- [ ] **Step 5: Verify dry run**

Run:

```bash
./server/gradlew -p server check architectureTest --dry-run
```

Expected after implementation: output includes `:test`, `:jacocoTestReport`, `:jacocoTestCoverageVerification`, `:check`, and `:architectureTest`, and does not include `:unitTest` unless explicitly requested.

- [ ] **Step 6: Run backend quality gate**

Run:

```bash
./server/gradlew -p server check architectureTest
```

Expected: BUILD SUCCESSFUL.

---

## Task 6: Release Hygiene and Changelog Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-05-14-front-tsconfig-modernize.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Fix the known whitespace failure**

In `docs/superpowers/plans/2026-05-14-front-tsconfig-modernize.md`, change:

```markdown
Expected: 0 errors.
```

to:

```markdown
Expected: 0 errors.
```

- [ ] **Step 2: Run release checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
./server/gradlew -p server check architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Update `CHANGELOG.md` Unreleased verification**

Replace the current Unreleased verification placeholder with:

```markdown
- `pnpm --dir front lint` - exit 0.
- `pnpm --dir front test` - 59 files / 755 tests passed.
- `pnpm --dir front build` - exit 0.
- `pnpm --dir front test:e2e` - 28 tests passed.
- `./server/gradlew -p server clean test` - BUILD SUCCESSFUL.
- `./server/gradlew -p server check architectureTest` - BUILD SUCCESSFUL.
- `./scripts/build-public-release-candidate.sh` - public release candidate built at `.tmp/public-release-candidate`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` - passed, gitleaks found no leaks.
- `git diff --check` - output 없음.
```

If counts change after implementation, record the fresh observed counts instead of the counts above.

- [ ] **Step 4: Run public-safety scans on changed docs**

Run:

```bash
rg -n -P "/U[s]ers|ocid1[.]|B[E]GIN .*PRIVATE|AK[I]A|AS[I]A|xox[baprs]-|ghp[_]|github[_]pat[_]|https?://[^\\s)]*readmates\\.(?!pages)" CHANGELOG.md docs/superpowers/plans/2026-05-14-front-tsconfig-modernize.md
```

Expected: no output.

---

## Final Verification

Run the full release baseline:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
./server/gradlew -p server check architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

Before final handoff, also run:

```bash
rg -n "insertManualDispatch|ManualNotificationStoredDispatch" server/src/main/kotlin server/src/test/kotlin
```

Expected: no output.

## Self-Review Checklist

- [ ] Duplicate confirm decision happens inside the persistence transaction after locking a stable session row.
- [ ] Consumed preview retry returns stored dispatch summary before live session/template/audience validation.
- [ ] Stale preview panel is cleared on template, audience, channel, included-member, and excluded-member changes.
- [ ] Production code has no `insertManualDispatch` bypass method.
- [ ] Gradle `check architectureTest --dry-run` does not run `unitTest` in addition to default `test`.
- [ ] Changelog verification matches freshly observed command output.
- [ ] Public release candidate check passes and reports no leaks.
