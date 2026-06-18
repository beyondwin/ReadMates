# ReadMates Session Closing Flywheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a host-first session closing flywheel that lets hosts see a session's closing status, lets members return from notifications into the reflection loop, and lets public records present published sessions as a polished showcase.

**Architecture:** Add a read-side `sessionclosing` server slice that computes host-safe closing status from existing session, publication, feedback, notification, and public-record data without adding a migration. The frontend consumes that contract through host feature API/query/model layers, renders a separate host closing route, and then tightens member notification deep links and public records display using feature-local models.

**Tech Stack:** Kotlin/Spring Boot, JDBC, MockMvc, MySQL Testcontainers, React/Vite, React Router 7, TanStack Query v5, Vitest, Playwright, public release candidate scanner.

## Global Constraints

- Follow `docs/agents/server.md`: controllers parse HTTP, application services own orchestration and authorization-sensitive state derivation, persistence adapters own SQL and row mapping.
- Follow `docs/agents/front.md`: route modules own data flow, UI components are props/callback driven, `features/<name>/model` stays pure.
- Follow `docs/agents/design.md`: host pages feel like an efficient operating ledger, member pages like a personal reading desk, public pages like a refined literary journal.
- Do not expose real member data, secrets, deployment state, local paths, private domains, OCIDs, raw email body, raw provider error, raw JSON body, or token-shaped examples.
- Default route for Host Closing Board is `/clubs/:slug/app/host/sessions/:sessionId/closing` plus `/app/host/sessions/:sessionId/closing` compatibility.
- No DB migration in this plan. Closing status is computed from existing tables.
- No new AI provider, prompt, model catalog, cost policy, platform-admin closing console, public SEO/RSS/SSR, PDF/print, or CI visual regression infrastructure.
- Every task ends with a scoped commit.

---

## File Structure

Server files:

- Create `server/src/main/kotlin/com/readmates/sessionclosing/application/model/SessionClosingModels.kt` for enums and DTOs used inside the use case.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/application/port/in/SessionClosingUseCases.kt` for `GetHostSessionClosingStatusUseCase`.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/application/port/out/LoadSessionClosingStatusPort.kt` for persistence projection loading.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusService.kt` for host authorization and state derivation.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt` for JDBC reads over existing tables.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt` for `GET /api/host/sessions/{sessionId}/closing-status`.
- Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/SessionClosingWebDtos.kt` for response DTOs and mapping.
- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` to register `sessionclosing` as a read-side slice.

Server tests:

- Create `server/src/test/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusServiceTest.kt`.
- Create `server/src/test/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`.
- Create `server/src/test/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapterTest.kt`.

Frontend host files:

- Modify `front/features/host/api/host-contracts.ts` with `HostSessionClosingStatusResponse`.
- Modify `front/features/host/api/host-api.ts` with `fetchHostSessionClosingStatus`.
- Modify `front/features/host/queries/host-session-queries.ts` with closing query key and invalidation.
- Create `front/features/host/model/session-closing-model.ts`.
- Create `front/features/host/model/session-closing-model.test.ts`.
- Create `front/features/host/route/host-session-closing-data.ts`.
- Create `front/features/host/route/host-session-closing-route.tsx`.
- Create `front/features/host/ui/session-closing-board.tsx`.
- Create `front/features/host/ui/session-closing-board.test.tsx`.
- Modify `front/src/styles/globals.css` for responsive host closing board layout styles.
- Modify `front/src/app/routes/host.tsx` to add the route.
- Modify `front/src/app/host-route-elements.tsx` to export the route element.

Frontend member files:

- Create `front/features/notifications/model/notification-link-model.ts`.
- Create `front/features/notifications/model/notification-link-model.test.ts`.
- Modify `front/features/notifications/ui/member-notifications-page.tsx` to use the model and show session-reflection actions for safe session links.
- Create `front/features/notifications/ui/member-notifications-page.test.tsx`.

Frontend public files:

- Modify `front/features/public/model/public-display-model.ts` with showcase display helpers.
- Create `front/features/public/model/public-display-model.test.ts`.
- Modify `front/features/public/ui/public-records-page.tsx`.
- Modify `front/features/public/ui/public-session.tsx`.
- Create `front/features/public/ui/public-records-page.test.tsx`.
- Create `front/features/public/ui/public-session.test.tsx`.

E2E and docs:

- Create `front/tests/e2e/session-closing-flywheel.spec.ts`.
- Modify `CHANGELOG.md`.
- Modify `docs/development/architecture.md`.
- Modify `docs/development/release-readiness-review.md` only at closeout when recording local evidence.

---

### Task 1: Server Closing Status Application Model

**Files:**
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/application/model/SessionClosingModels.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/application/port/in/SessionClosingUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/application/port/out/LoadSessionClosingStatusPort.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusService.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusServiceTest.kt`

**Interfaces:**
- Consumes: `CurrentMember`, `SessionRecordVisibility`, `requireHost` equivalent behavior via `CurrentMember.isHost`.
- Produces:
  - `interface GetHostSessionClosingStatusUseCase { fun getHostSessionClosingStatus(host: CurrentMember, sessionId: UUID): HostSessionClosingStatus }`
  - `interface LoadSessionClosingStatusPort { fun loadHostSessionClosingSnapshot(host: CurrentMember, sessionId: UUID): SessionClosingSnapshot? }`
  - `class SessionClosingStatusService(...) : GetHostSessionClosingStatusUseCase`

- [ ] **Step 1: Write the failing service tests**

Create `server/src/test/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusServiceTest.kt`:

```kotlin
package com.readmates.sessionclosing.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.NotificationClosingEvent
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class SessionClosingStatusServiceTest {
    private val sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val host = member(role = MembershipRole.HOST)
    private val member = member(role = MembershipRole.MEMBER)
    private val port = FakeLoadSessionClosingStatusPort()
    private val service = SessionClosingStatusService(port)

    @Test
    fun `rejects non host member`() {
        port.snapshot = closedSessionSnapshot()

        assertThrows(AccessDeniedException::class.java) {
            service.getHostSessionClosingStatus(member, sessionId)
        }
    }

    @Test
    fun `open session requires close session as primary action`() {
        port.snapshot = closedSessionSnapshot(state = "OPEN", summaryPublished = false, highlightCount = 0, oneLinerCount = 0)

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.IN_PROGRESS)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.CLOSE_SESSION)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.SESSION_CLOSED }.state)
            .isEqualTo(ClosingChecklistState.ACTION_REQUIRED)
    }

    @Test
    fun `closed session without record package points to import records`() {
        port.snapshot = closedSessionSnapshot(state = "CLOSED", summaryPublished = false, highlightCount = 0, oneLinerCount = 0)

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.IN_PROGRESS)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.IMPORT_RECORDS)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.RECORD_PACKAGE_SAVED }.state)
            .isEqualTo(ClosingChecklistState.ACTION_REQUIRED)
    }

    @Test
    fun `invalid feedback document blocks closing`() {
        port.snapshot = closedSessionSnapshot(feedbackDocumentState = FeedbackDocumentClosingState.INVALID)

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.BLOCKED)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.FEEDBACK_DOCUMENT_READY }.state)
            .isEqualTo(ClosingChecklistState.BLOCKED)
    }

    @Test
    fun `public published session with sent notification is published`() {
        port.snapshot = closedSessionSnapshot(
            state = "PUBLISHED",
            visibility = SessionRecordVisibility.PUBLIC,
            publicVisible = true,
            publicRecordHref = "/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111",
            latestNotificationEvent = NotificationClosingEvent(
                eventType = "FEEDBACK_DOCUMENT_PUBLISHED",
                status = NotificationClosingStatus.PUBLISHED,
                createdAt = OffsetDateTime.parse("2026-06-18T10:00:00Z"),
            ),
        )

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.PUBLISHED)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.REVIEW_PUBLIC_PAGE)
        assertThat(status.evidence.publicRecordHref).isEqualTo("/clubs/reading-sai/sessions/$sessionId")
    }

    private fun closedSessionSnapshot(
        state: String = "CLOSED",
        visibility: SessionRecordVisibility = SessionRecordVisibility.MEMBER,
        summaryPublished: Boolean = true,
        highlightCount: Int = 2,
        oneLinerCount: Int = 3,
        feedbackDocumentState: FeedbackDocumentClosingState = FeedbackDocumentClosingState.AVAILABLE,
        latestNotificationEvent: NotificationClosingEvent? = null,
        publicVisible: Boolean = false,
        publicRecordHref: String? = null,
    ) = SessionClosingSnapshot(
        sessionId = sessionId,
        sessionNumber = 7,
        bookTitle = "테스트 책",
        meetingDate = LocalDate.parse("2026-06-18"),
        state = state,
        recordVisibility = visibility,
        summaryPublished = summaryPublished,
        highlightCount = highlightCount,
        oneLinerCount = oneLinerCount,
        feedbackDocumentState = feedbackDocumentState,
        latestNotificationEvent = latestNotificationEvent,
        publicVisible = publicVisible,
        publicRecordHref = publicRecordHref,
        memberReflectionHref = "/clubs/reading-sai/app/sessions/$sessionId",
    )

    private fun member(role: MembershipRole) = CurrentMember(
        userId = UUID.randomUUID(),
        membershipId = UUID.randomUUID(),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "호스트",
        accountName = "호스트",
        role = role,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    private class FakeLoadSessionClosingStatusPort : LoadSessionClosingStatusPort {
        var snapshot: SessionClosingSnapshot? = null

        override fun loadHostSessionClosingSnapshot(
            host: CurrentMember,
            sessionId: UUID,
        ): SessionClosingSnapshot? = snapshot
    }
}
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionclosing.application.service.SessionClosingStatusServiceTest'
```

Expected: FAIL because `sessionclosing` model, port, and service classes do not exist.

- [ ] **Step 3: Add the application models and ports**

Create `server/src/main/kotlin/com/readmates/sessionclosing/application/model/SessionClosingModels.kt`:

```kotlin
package com.readmates.sessionclosing.application.model

import com.readmates.session.application.SessionRecordVisibility
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

enum class ClosingOverallState {
    NOT_STARTED,
    IN_PROGRESS,
    BLOCKED,
    READY,
    PUBLISHED,
}

enum class ClosingPrimaryAction {
    CLOSE_SESSION,
    IMPORT_RECORDS,
    PUBLISH_RECORDS,
    SEND_NOTIFICATION,
    REVIEW_PUBLIC_PAGE,
    NONE,
}

enum class ClosingChecklistId {
    SESSION_CLOSED,
    RECORD_PACKAGE_SAVED,
    FEEDBACK_DOCUMENT_READY,
    MEMBER_NOTIFICATION_SENT,
    PUBLIC_RECORD_VISIBLE,
    PUBLIC_SHOWCASE_READY,
}

enum class ClosingChecklistState {
    DONE,
    ACTION_REQUIRED,
    BLOCKED,
    NOT_APPLICABLE,
}

enum class FeedbackDocumentClosingState {
    AVAILABLE,
    MISSING,
    LOCKED,
    INVALID,
}

enum class NotificationClosingStatus {
    PENDING,
    PUBLISHED,
    FAILED,
    DEAD,
}

data class NotificationClosingEvent(
    val eventType: String,
    val status: NotificationClosingStatus,
    val createdAt: OffsetDateTime,
)

data class SessionClosingSnapshot(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val state: String,
    val recordVisibility: SessionRecordVisibility,
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: FeedbackDocumentClosingState,
    val latestNotificationEvent: NotificationClosingEvent?,
    val publicVisible: Boolean,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)

data class HostSessionClosingStatus(
    val session: ClosingSessionSummary,
    val overall: ClosingOverall,
    val checklist: List<ClosingChecklistItem>,
    val evidence: ClosingEvidence,
)

data class ClosingSessionSummary(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val state: String,
    val recordVisibility: SessionRecordVisibility,
)

data class ClosingOverall(
    val state: ClosingOverallState,
    val label: String,
    val primaryAction: ClosingPrimaryAction,
)

data class ClosingChecklistItem(
    val id: ClosingChecklistId,
    val state: ClosingChecklistState,
    val label: String,
    val detail: String,
    val href: String? = null,
)

data class ClosingEvidence(
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: FeedbackDocumentClosingState,
    val latestNotificationEvent: NotificationClosingEvent?,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)
```

Create `server/src/main/kotlin/com/readmates/sessionclosing/application/port/in/SessionClosingUseCases.kt`:

```kotlin
package com.readmates.sessionclosing.application.port.`in`

import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface GetHostSessionClosingStatusUseCase {
    fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus
}
```

Create `server/src/main/kotlin/com/readmates/sessionclosing/application/port/out/LoadSessionClosingStatusPort.kt`:

```kotlin
package com.readmates.sessionclosing.application.port.out

import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface LoadSessionClosingStatusPort {
    fun loadHostSessionClosingSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionClosingSnapshot?
}
```

- [ ] **Step 4: Add the minimal service implementation**

Create `server/src/main/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusService.kt`:

```kotlin
package com.readmates.sessionclosing.application.service

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingEvidence
import com.readmates.sessionclosing.application.model.ClosingOverall
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.ClosingSessionSummary
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class SessionClosingStatusService(
    private val loadPort: LoadSessionClosingStatusPort,
) : GetHostSessionClosingStatusUseCase {
    override fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        val snapshot = loadPort.loadHostSessionClosingSnapshot(host, sessionId) ?: throw HostSessionNotFoundException()
        return snapshot.toClosingStatus()
    }
}

private fun SessionClosingSnapshot.toClosingStatus(): HostSessionClosingStatus {
    val sessionClosed = state in setOf("CLOSED", "PUBLISHED")
    val recordSaved = summaryPublished || highlightCount > 0 || oneLinerCount > 0
    val feedbackReady = feedbackDocumentState == FeedbackDocumentClosingState.AVAILABLE
    val feedbackBlocked = feedbackDocumentState == FeedbackDocumentClosingState.INVALID
    val notificationSent = latestNotificationEvent?.status == NotificationClosingStatus.PUBLISHED
    val publicApplicable = recordVisibility == SessionRecordVisibility.PUBLIC
    val publicReady = publicApplicable && publicVisible && publicRecordHref != null

    val overall =
        when {
            feedbackBlocked -> ClosingOverall(ClosingOverallState.BLOCKED, "차단됨", ClosingPrimaryAction.IMPORT_RECORDS)
            !sessionClosed -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "진행 중", ClosingPrimaryAction.CLOSE_SESSION)
            !recordSaved -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "진행 중", ClosingPrimaryAction.IMPORT_RECORDS)
            !feedbackReady -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "진행 중", ClosingPrimaryAction.IMPORT_RECORDS)
            !notificationSent -> ClosingOverall(ClosingOverallState.READY, "발행 준비", ClosingPrimaryAction.SEND_NOTIFICATION)
            publicApplicable && !publicReady -> ClosingOverall(ClosingOverallState.READY, "발행 준비", ClosingPrimaryAction.PUBLISH_RECORDS)
            publicReady -> ClosingOverall(ClosingOverallState.PUBLISHED, "발행 완료", ClosingPrimaryAction.REVIEW_PUBLIC_PAGE)
            else -> ClosingOverall(ClosingOverallState.READY, "발행 준비", ClosingPrimaryAction.NONE)
        }

    return HostSessionClosingStatus(
        session = ClosingSessionSummary(sessionId, sessionNumber, bookTitle, meetingDate, state, recordVisibility),
        overall = overall,
        checklist = listOf(
            checklist(ClosingChecklistId.SESSION_CLOSED, sessionClosed, "세션 종료", "모임 진행 상태가 닫혔습니다.", "/app/host/sessions/$sessionId/edit"),
            checklist(ClosingChecklistId.RECORD_PACKAGE_SAVED, recordSaved, "기록 패키지 저장", "요약, 하이라이트, 한줄평 중 하나 이상이 저장되었습니다.", "/app/host/sessions/$sessionId/edit?records=json"),
            feedbackChecklist(feedbackReady, feedbackBlocked, sessionId),
            checklist(ClosingChecklistId.MEMBER_NOTIFICATION_SENT, notificationSent, "멤버 알림 발송", "멤버가 회고 루프로 돌아올 알림 상태입니다.", "/app/host/notifications"),
            publicChecklist(ClosingChecklistId.PUBLIC_RECORD_VISIBLE, publicApplicable, publicReady, "공개 기록 노출", publicRecordHref),
            publicChecklist(ClosingChecklistId.PUBLIC_SHOWCASE_READY, publicApplicable, publicReady, "공개 쇼케이스 확인", publicRecordHref),
        ),
        evidence = ClosingEvidence(
            summaryPublished = summaryPublished,
            highlightCount = highlightCount.coerceAtLeast(0),
            oneLinerCount = oneLinerCount.coerceAtLeast(0),
            feedbackDocumentState = feedbackDocumentState,
            latestNotificationEvent = latestNotificationEvent,
            publicRecordHref = publicRecordHref,
            memberReflectionHref = memberReflectionHref,
        ),
    )
}

private fun checklist(
    id: ClosingChecklistId,
    done: Boolean,
    label: String,
    detail: String,
    href: String?,
) = ClosingChecklistItem(
    id = id,
    state = if (done) ClosingChecklistState.DONE else ClosingChecklistState.ACTION_REQUIRED,
    label = label,
    detail = detail,
    href = href,
)

private fun feedbackChecklist(
    ready: Boolean,
    blocked: Boolean,
    sessionId: UUID,
) = ClosingChecklistItem(
    id = ClosingChecklistId.FEEDBACK_DOCUMENT_READY,
    state =
        when {
            ready -> ClosingChecklistState.DONE
            blocked -> ClosingChecklistState.BLOCKED
            else -> ClosingChecklistState.ACTION_REQUIRED
        },
    label = "피드백 문서 준비",
    detail = if (ready) "피드백 문서가 준비되었습니다." else "피드백 문서를 확인해야 합니다.",
    href = "/app/host/sessions/$sessionId/edit?records=json",
)

private fun publicChecklist(
    id: ClosingChecklistId,
    applicable: Boolean,
    ready: Boolean,
    label: String,
    href: String?,
) = ClosingChecklistItem(
    id = id,
    state =
        when {
            !applicable -> ClosingChecklistState.NOT_APPLICABLE
            ready -> ClosingChecklistState.DONE
            else -> ClosingChecklistState.ACTION_REQUIRED
        },
    label = label,
    detail = if (ready) "공개 표면에서 확인할 수 있습니다." else "공개 기록 조건을 확인해야 합니다.",
    href = href,
)
```

- [ ] **Step 5: Run the service test**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionclosing.application.service.SessionClosingStatusServiceTest'
```

Expected: PASS.

- [ ] **Step 6: Commit the application model**

```bash
git add server/src/main/kotlin/com/readmates/sessionclosing server/src/test/kotlin/com/readmates/sessionclosing/application/service/SessionClosingStatusServiceTest.kt
git commit -m "feat(server): model session closing status"
```

---

### Task 2: Server Persistence Adapter and Host API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/SessionClosingWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapterTest.kt`
- Test: `server/src/test/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`

**Interfaces:**
- Consumes: Task 1 `GetHostSessionClosingStatusUseCase`, `LoadSessionClosingStatusPort`, `HostSessionClosingStatus`.
- Produces: browser-facing JSON with `schema: "host.session_closing_status.v1"` and enum names matching `front/features/host/api/host-contracts.ts`.

- [ ] **Step 1: Write controller and adapter tests first**

Create `server/src/test/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`:

```kotlin
package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingEvidence
import com.readmates.sessionclosing.application.model.ClosingOverall
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.ClosingSessionSummary
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.LocalDate
import java.util.UUID

@WebMvcTest(HostSessionClosingController::class)
@Import(HostSessionClosingControllerTest.TestConfig::class)
class HostSessionClosingControllerTest(
    private val mockMvc: MockMvc,
    private val useCase: FakeGetHostSessionClosingStatusUseCase,
) {
    @Test
    fun `returns public safe host closing status`() {
        useCase.response = response()

        mockMvc
            .get("/api/host/sessions/11111111-1111-1111-1111-111111111111/closing-status") {
                with(user("host@example.com"))
                accept = MediaType.APPLICATION_JSON
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("host.session_closing_status.v1") }
                jsonPath("$.overall.state") { value("READY") }
                jsonPath("$.overall.primaryAction") { value("SEND_NOTIFICATION") }
                jsonPath("$.checklist[0].id") { value("SESSION_CLOSED") }
                jsonPath("$.evidence.highlightCount") { value(2) }
                jsonPath("$.evidence.publicRecordHref") { value("/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111") }
                jsonPath("$.evidence.rawEmail") { doesNotExist() }
                jsonPath("$.evidence.providerError") { doesNotExist() }
            }
    }

    private fun response() = HostSessionClosingStatus(
        session = ClosingSessionSummary(
            sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111"),
            sessionNumber = 7,
            bookTitle = "테스트 책",
            meetingDate = LocalDate.parse("2026-06-18"),
            state = "CLOSED",
            recordVisibility = SessionRecordVisibility.PUBLIC,
        ),
        overall = ClosingOverall(ClosingOverallState.READY, "발행 준비", ClosingPrimaryAction.SEND_NOTIFICATION),
        checklist = listOf(
            ClosingChecklistItem(
                id = ClosingChecklistId.SESSION_CLOSED,
                state = ClosingChecklistState.DONE,
                label = "세션 종료",
                detail = "모임 진행 상태가 닫혔습니다.",
                href = "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
            ),
        ),
        evidence = ClosingEvidence(
            summaryPublished = true,
            highlightCount = 2,
            oneLinerCount = 3,
            feedbackDocumentState = FeedbackDocumentClosingState.AVAILABLE,
            latestNotificationEvent = null,
            publicRecordHref = "/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111",
            memberReflectionHref = "/clubs/reading-sai/app/sessions/11111111-1111-1111-1111-111111111111",
        ),
    )

    class TestConfig {
        @Bean
        fun fakeUseCase() = FakeGetHostSessionClosingStatusUseCase()
    }
}

class FakeGetHostSessionClosingStatusUseCase : GetHostSessionClosingStatusUseCase {
    lateinit var response: HostSessionClosingStatus

    override fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus = response
}
```

Create `server/src/test/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapterTest.kt` with a focused MySQL integration test:

```kotlin
package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
@Sql(statements = [SESSION_CLOSING_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [SESSION_CLOSING_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class JdbcSessionClosingStatusAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcSessionClosingStatusAdapter(jdbcTemplate)
    private val sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111")

    @Test
    fun `loads counts feedback state notification status and public href for host club session`() {
        seedClosedPublishedSession()

        val snapshot = adapter.loadHostSessionClosingSnapshot(host(), sessionId)

        assertThat(snapshot).isNotNull
        assertThat(snapshot!!.sessionNumber).isEqualTo(77)
        assertThat(snapshot.recordVisibility).isEqualTo(SessionRecordVisibility.PUBLIC)
        assertThat(snapshot.summaryPublished).isTrue()
        assertThat(snapshot.highlightCount).isEqualTo(2)
        assertThat(snapshot.oneLinerCount).isEqualTo(1)
        assertThat(snapshot.feedbackDocumentState).isEqualTo(FeedbackDocumentClosingState.AVAILABLE)
        assertThat(snapshot.latestNotificationEvent?.eventType).isEqualTo("FEEDBACK_DOCUMENT_PUBLISHED")
        assertThat(snapshot.publicVisible).isTrue()
        assertThat(snapshot.publicRecordHref).isEqualTo("/clubs/reading-sai/sessions/$sessionId")
    }

    private fun host() = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "김호스트",
        accountName = "김호스트",
        role = com.readmates.auth.domain.MembershipRole.HOST,
    )

    private fun seedClosedPublishedSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, '00000000-0000-0000-0000-000000000001', 77, '77회차', '테스트 책', '테스트 저자',
              '2026-06-18', '19:30:00', '21:30:00', '2026-06-18 12:00:00', '온라인', 'PUBLISHED', 'PUBLIC')
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (club_id, session_id, public_summary, visibility, is_public, published_at)
            values ('00000000-0000-0000-0000-000000000001', ?, '공개 요약입니다.', 'PUBLIC', true, current_timestamp)
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update("insert into highlights (club_id, session_id, text, sort_order) values ('00000000-0000-0000-0000-000000000001', ?, '문장 1', 1)", sessionId.toString())
        jdbcTemplate.update("insert into highlights (club_id, session_id, text, sort_order) values ('00000000-0000-0000-0000-000000000001', ?, '문장 2', 2)", sessionId.toString())
        jdbcTemplate.update("insert into one_line_reviews (club_id, session_id, membership_id, text) values ('00000000-0000-0000-0000-000000000001', ?, '00000000-0000-0000-0000-000000000201', '한줄평')", sessionId.toString())
        jdbcTemplate.update("insert into session_feedback_documents (club_id, session_id, file_name, markdown, uploaded_at) values ('00000000-0000-0000-0000-000000000001', ?, 'session-77.md', '<!-- readmates-feedback:v1 -->', current_timestamp)", sessionId.toString())
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              status, kafka_topic, kafka_key, dedupe_key, created_at, updated_at
            )
            values (
              '22222222-2222-2222-2222-222222222222',
              '00000000-0000-0000-0000-000000000001',
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              ?,
              '{"sessionId":"11111111-1111-1111-1111-111111111111"}',
              'PUBLISHED',
              'readmates.notification.events.v1',
              ?,
              'feedback-document:11111111-1111-1111-1111-111111111111',
              current_timestamp,
              current_timestamp
            )
            """.trimIndent(),
            sessionId.toString(),
            sessionId.toString(),
        )
    }
}

private const val SESSION_CLOSING_CLEANUP_SQL = """
delete from notification_event_outbox where aggregate_id = '11111111-1111-1111-1111-111111111111';
delete from session_feedback_documents where session_id = '11111111-1111-1111-1111-111111111111';
delete from one_line_reviews where session_id = '11111111-1111-1111-1111-111111111111';
delete from highlights where session_id = '11111111-1111-1111-1111-111111111111';
delete from public_session_publications where session_id = '11111111-1111-1111-1111-111111111111';
delete from sessions where id = '11111111-1111-1111-1111-111111111111';
"""
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionclosing.adapter.in.web.HostSessionClosingControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionclosing.adapter.out.persistence.JdbcSessionClosingStatusAdapterTest'
```

Expected: FAIL because controller, DTO mapper, and JDBC adapter do not exist.

- [ ] **Step 3: Add web DTOs and controller**

Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/SessionClosingWebDtos.kt`:

```kotlin
package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.model.NotificationClosingEvent

data class HostSessionClosingStatusResponse(
    val schema: String = "host.session_closing_status.v1",
    val session: ClosingSessionResponse,
    val overall: ClosingOverallResponse,
    val checklist: List<ClosingChecklistResponse>,
    val evidence: ClosingEvidenceResponse,
)

data class ClosingSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: String,
    val state: String,
    val recordVisibility: String,
)

data class ClosingOverallResponse(
    val state: String,
    val label: String,
    val primaryAction: String,
)

data class ClosingChecklistResponse(
    val id: String,
    val state: String,
    val label: String,
    val detail: String,
    val href: String?,
)

data class ClosingEvidenceResponse(
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: String,
    val latestNotificationEvent: ClosingNotificationEventResponse?,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)

data class ClosingNotificationEventResponse(
    val eventType: String,
    val status: String,
    val createdAt: String,
)

fun HostSessionClosingStatus.toResponse() = HostSessionClosingStatusResponse(
    session = ClosingSessionResponse(
        sessionId = session.sessionId.toString(),
        sessionNumber = session.sessionNumber,
        bookTitle = session.bookTitle,
        meetingDate = session.meetingDate.toString(),
        state = session.state,
        recordVisibility = session.recordVisibility.name,
    ),
    overall = ClosingOverallResponse(
        state = overall.state.name,
        label = overall.label,
        primaryAction = overall.primaryAction.name,
    ),
    checklist = checklist.map(ClosingChecklistItem::toResponse),
    evidence = ClosingEvidenceResponse(
        summaryPublished = evidence.summaryPublished,
        highlightCount = evidence.highlightCount,
        oneLinerCount = evidence.oneLinerCount,
        feedbackDocumentState = evidence.feedbackDocumentState.name,
        latestNotificationEvent = evidence.latestNotificationEvent?.toResponse(),
        publicRecordHref = evidence.publicRecordHref,
        memberReflectionHref = evidence.memberReflectionHref,
    ),
)

private fun ClosingChecklistItem.toResponse() = ClosingChecklistResponse(
    id = id.name,
    state = state.name,
    label = label,
    detail = detail,
    href = href,
)

private fun NotificationClosingEvent.toResponse() = ClosingNotificationEventResponse(
    eventType = eventType,
    status = status.name,
    createdAt = createdAt.toString(),
)
```

Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt`:

```kotlin
package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.session.adapter.`in`.web.parseHostSessionId
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/closing-status")
class HostSessionClosingController(
    private val getHostSessionClosingStatusUseCase: GetHostSessionClosingStatusUseCase,
) {
    @GetMapping
    fun get(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ): HostSessionClosingStatusResponse =
        getHostSessionClosingStatusUseCase
            .getHostSessionClosingStatus(member, parseHostSessionId(sessionId))
            .toResponse()
}
```

- [ ] **Step 4: Add JDBC adapter**

Create `server/src/main/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt`:

```kotlin
package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.NotificationClosingEvent
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

@Component
class JdbcSessionClosingStatusAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadSessionClosingStatusPort {
    override fun loadHostSessionClosingSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionClosingSnapshot? {
        val base =
            jdbcTemplate
                .query(
                    """
                    select
                      sessions.id,
                      sessions.number,
                      sessions.book_title,
                      sessions.session_date,
                      sessions.state,
                      sessions.visibility,
                      public_session_publications.public_summary,
                      public_session_publications.is_public,
                      public_session_publications.published_at,
                      exists (
                        select 1 from session_feedback_documents
                        where session_feedback_documents.club_id = sessions.club_id
                          and session_feedback_documents.session_id = sessions.id
                      ) as feedback_uploaded,
                      (select count(*) from highlights where highlights.club_id = sessions.club_id and highlights.session_id = sessions.id) as highlight_count,
                      (select count(*) from one_line_reviews where one_line_reviews.club_id = sessions.club_id and one_line_reviews.session_id = sessions.id) as one_liner_count
                    from sessions
                    left join public_session_publications on public_session_publications.club_id = sessions.club_id
                      and public_session_publications.session_id = sessions.id
                    where sessions.id = ?
                      and sessions.club_id = ?
                    """.trimIndent(),
                    { rs, _ -> rs.toClosingBase(host.clubSlug) },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                ).firstOrNull()
                ?: return null

        val latestEvent = latestNotificationEvent(sessionId, host.clubId)

        return base.copy(latestNotificationEvent = latestEvent)
    }

    private fun latestNotificationEvent(
        sessionId: UUID,
        clubId: UUID,
    ): NotificationClosingEvent? =
        jdbcTemplate
            .query(
                """
                select event_type, status, created_at
                from notification_event_outbox
                where club_id = ?
                  and aggregate_id = ?
                  and event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
                order by created_at desc, id desc
                limit 1
                """.trimIndent(),
                { rs, _ ->
                    NotificationClosingEvent(
                        eventType = rs.getString("event_type"),
                        status = rs.getString("status").toNotificationClosingStatus(),
                        createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                    )
                },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
}

private fun ResultSet.toClosingBase(clubSlug: String): SessionClosingSnapshot {
    val sessionId = UUID.fromString(getString("id"))
    val visibility = SessionRecordVisibility.valueOf(getString("visibility"))
    val isPublic = getBoolean("is_public") && getObject("published_at") != null && visibility == SessionRecordVisibility.PUBLIC
    val feedbackUploaded = getBoolean("feedback_uploaded")

    return SessionClosingSnapshot(
        sessionId = sessionId,
        sessionNumber = getInt("number"),
        bookTitle = getString("book_title"),
        meetingDate = getObject("session_date", LocalDate::class.java),
        state = getString("state"),
        recordVisibility = visibility,
        summaryPublished = !getString("public_summary").isNullOrBlank(),
        highlightCount = getInt("highlight_count"),
        oneLinerCount = getInt("one_liner_count"),
        feedbackDocumentState = if (feedbackUploaded) FeedbackDocumentClosingState.AVAILABLE else FeedbackDocumentClosingState.MISSING,
        latestNotificationEvent = null,
        publicVisible = isPublic,
        publicRecordHref = if (isPublic) "/clubs/$clubSlug/sessions/$sessionId" else null,
        memberReflectionHref = "/clubs/$clubSlug/app/sessions/$sessionId",
    )
}

private fun String.toNotificationClosingStatus(): NotificationClosingStatus =
    when (this) {
        "PUBLISHED", "SENT" -> NotificationClosingStatus.PUBLISHED
        "FAILED" -> NotificationClosingStatus.FAILED
        "DEAD" -> NotificationClosingStatus.DEAD
        else -> NotificationClosingStatus.PENDING
    }
```

- [ ] **Step 5: Register slice in architecture test**

Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` by adding this entry near other read-side slices:

```kotlin
ServerSlice(
    name = "sessionclosing",
    type = ServerSliceType.READ,
    webAdapterPackages = listOf("com.readmates.sessionclosing.adapter.in.web.."),
    applicationPackages = listOf("com.readmates.sessionclosing.application.."),
),
```

Modify the registry assertion to include `sessionclosing`:

```kotlin
registered.containsAll(setOf("admin.audit", "admin.health", "admin.analytics", "aigen", "sessionclosing"))
```

- [ ] **Step 6: Run server targeted tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionclosing.application.service.SessionClosingStatusServiceTest' --tests 'com.readmates.sessionclosing.adapter.in.web.HostSessionClosingControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionclosing.adapter.out.persistence.JdbcSessionClosingStatusAdapterTest'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 7: Commit server API**

```bash
git add server/src/main/kotlin/com/readmates/sessionclosing server/src/test/kotlin/com/readmates/sessionclosing server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat(server): expose host session closing status"
```

---

### Task 3: Frontend Host Closing Contract, Query, and View Model

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Create: `front/features/host/model/session-closing-model.ts`
- Create: `front/features/host/model/session-closing-model.test.ts`

**Interfaces:**
- Consumes: Task 2 JSON contract.
- Produces:
  - `HostSessionClosingStatusResponse`
  - `fetchHostSessionClosingStatus(sessionId, context)`
  - `hostSessionClosingStatusQuery(sessionId, context)`
  - `getSessionClosingBoardView(status): SessionClosingBoardView`

- [ ] **Step 1: Write frontend model tests**

Create `front/features/host/model/session-closing-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { HostSessionClosingStatusResponse } from "@/features/host/api/host-contracts";
import { getSessionClosingBoardView } from "./session-closing-model";

const baseStatus: HostSessionClosingStatusResponse = {
  schema: "host.session_closing_status.v1",
  session: {
    sessionId: "11111111-1111-1111-1111-111111111111",
    sessionNumber: 7,
    bookTitle: "E2E 책",
    meetingDate: "2026-06-18",
    state: "CLOSED",
    recordVisibility: "PUBLIC",
  },
  overall: {
    state: "READY",
    label: "발행 준비",
    primaryAction: "SEND_NOTIFICATION",
  },
  checklist: [
    { id: "SESSION_CLOSED", state: "DONE", label: "세션 종료", detail: "닫힘", href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit" },
    { id: "MEMBER_NOTIFICATION_SENT", state: "ACTION_REQUIRED", label: "멤버 알림 발송", detail: "대기", href: "/app/host/notifications" },
  ],
  evidence: {
    summaryPublished: true,
    highlightCount: 2,
    oneLinerCount: 1,
    feedbackDocumentState: "AVAILABLE",
    latestNotificationEvent: null,
    publicRecordHref: "/clubs/club-a/sessions/11111111-1111-1111-1111-111111111111",
    memberReflectionHref: "/clubs/club-a/app/sessions/11111111-1111-1111-1111-111111111111",
  },
};

describe("getSessionClosingBoardView", () => {
  it("builds primary action and surface cards without leaking internal details", () => {
    const view = getSessionClosingBoardView(baseStatus);

    expect(view.title).toBe("No.07 · E2E 책");
    expect(view.statusTone).toBe("accent");
    expect(view.primaryAction.label).toBe("멤버 알림 확인");
    expect(view.surfaces.map((surface) => surface.id)).toEqual(["HOST", "MEMBER", "PUBLIC"]);
    expect(JSON.stringify(view)).not.toContain("member1@example.com");
    expect(JSON.stringify(view)).not.toContain("ADMIN_ROUTE");
  });

  it("marks blocked feedback as danger tone", () => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      overall: { state: "BLOCKED", label: "차단됨", primaryAction: "IMPORT_RECORDS" },
      evidence: { ...baseStatus.evidence, feedbackDocumentState: "INVALID" },
    });

    expect(view.statusTone).toBe("danger");
    expect(view.evidence.find((item) => item.label === "피드백 문서")?.value).toBe("확인 필요");
  });
});
```

- [ ] **Step 2: Run the failing model test**

Run:

```bash
pnpm --dir front test -- session-closing-model
```

Expected: FAIL because contract and model do not exist.

- [ ] **Step 3: Add host contract types**

Append to `front/features/host/api/host-contracts.ts`:

```ts
export type HostSessionClosingOverallState = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "READY" | "PUBLISHED";
export type HostSessionClosingPrimaryAction =
  | "CLOSE_SESSION"
  | "IMPORT_RECORDS"
  | "PUBLISH_RECORDS"
  | "SEND_NOTIFICATION"
  | "REVIEW_PUBLIC_PAGE"
  | "NONE";
export type HostSessionClosingChecklistId =
  | "SESSION_CLOSED"
  | "RECORD_PACKAGE_SAVED"
  | "FEEDBACK_DOCUMENT_READY"
  | "MEMBER_NOTIFICATION_SENT"
  | "PUBLIC_RECORD_VISIBLE"
  | "PUBLIC_SHOWCASE_READY";
export type HostSessionClosingChecklistState = "DONE" | "ACTION_REQUIRED" | "BLOCKED" | "NOT_APPLICABLE";
export type HostSessionClosingFeedbackDocumentState = "AVAILABLE" | "MISSING" | "LOCKED" | "INVALID";
export type HostSessionClosingNotificationStatus = "PENDING" | "PUBLISHED" | "FAILED" | "DEAD";

export type HostSessionClosingStatusResponse = {
  schema: "host.session_closing_status.v1";
  session: {
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    meetingDate: string;
    state: SessionState;
    recordVisibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  };
  overall: {
    state: HostSessionClosingOverallState;
    label: string;
    primaryAction: HostSessionClosingPrimaryAction;
  };
  checklist: Array<{
    id: HostSessionClosingChecklistId;
    state: HostSessionClosingChecklistState;
    label: string;
    detail: string;
    href: string | null;
  }>;
  evidence: {
    summaryPublished: boolean;
    highlightCount: number;
    oneLinerCount: number;
    feedbackDocumentState: HostSessionClosingFeedbackDocumentState;
    latestNotificationEvent: {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "NEXT_BOOK_PUBLISHED";
      status: HostSessionClosingNotificationStatus;
      createdAt: string;
    } | null;
    publicRecordHref: string | null;
    memberReflectionHref: string | null;
  };
};
```

- [ ] **Step 4: Add API fetch and query**

Modify `front/features/host/api/host-api.ts` imports to include `HostSessionClosingStatusResponse`, then add:

```ts
export function fetchHostSessionClosingStatus(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionClosingStatusResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/closing-status`,
    undefined,
    context,
  );
}
```

Modify `front/features/host/queries/host-session-queries.ts` imports to include `fetchHostSessionClosingStatus` and `HostSessionClosingStatusResponse`, then add a key:

```ts
closingStatus: (sessionId: string, context?: ReadmatesApiContext) =>
  [...hostSessionKeys.scope(context), "closingStatus", sessionId] as const,
```

Add query helper:

```ts
export function hostSessionClosingStatusQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<HostSessionClosingStatusResponse>({
    queryKey: hostSessionKeys.closingStatus(sessionId, context),
    queryFn: () => fetchHostSessionClosingStatus(sessionId, context),
  });
}
```

Update `invalidateSessionMutationSurfaces` to invalidate closing status:

```ts
invalidateHostSessionClosingStatus(client, sessionId, context),
```

and define:

```ts
export function invalidateHostSessionClosingStatus(client: QueryClient, sessionId: string, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.closingStatus(sessionId, context) });
}
```

- [ ] **Step 5: Add pure view model**

Create `front/features/host/model/session-closing-model.ts`:

```ts
import type {
  HostSessionClosingChecklistState,
  HostSessionClosingStatusResponse,
} from "@/features/host/api/host-contracts";

export type SessionClosingTone = "ok" | "accent" | "warn" | "danger" | "muted";

export type SessionClosingBoardView = {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: SessionClosingTone;
  primaryAction: {
    label: string;
    href: string | null;
  };
  checklist: Array<{
    id: string;
    label: string;
    detail: string;
    state: HostSessionClosingChecklistState;
    tone: SessionClosingTone;
    href: string | null;
  }>;
  surfaces: Array<{
    id: "HOST" | "MEMBER" | "PUBLIC";
    title: string;
    detail: string;
    tone: SessionClosingTone;
    href: string | null;
  }>;
  evidence: Array<{
    label: string;
    value: string;
  }>;
};

export function getSessionClosingBoardView(status: HostSessionClosingStatusResponse): SessionClosingBoardView {
  return {
    title: `No.${String(status.session.sessionNumber).padStart(2, "0")} · ${status.session.bookTitle}`,
    subtitle: `${status.session.meetingDate} · ${visibilityLabel(status.session.recordVisibility)}`,
    statusLabel: status.overall.label,
    statusTone: overallTone(status.overall.state),
    primaryAction: primaryAction(status),
    checklist: status.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      state: item.state,
      tone: checklistTone(item.state),
      href: item.href,
    })),
    surfaces: [
      {
        id: "HOST",
        title: "Host",
        detail: hostSurfaceDetail(status),
        tone: overallTone(status.overall.state),
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      },
      {
        id: "MEMBER",
        title: "Member",
        detail: memberSurfaceDetail(status),
        tone: status.evidence.memberReflectionHref ? "ok" : "muted",
        href: status.evidence.memberReflectionHref,
      },
      {
        id: "PUBLIC",
        title: "Public",
        detail: publicSurfaceDetail(status),
        tone: status.evidence.publicRecordHref ? "ok" : "muted",
        href: status.evidence.publicRecordHref,
      },
    ],
    evidence: [
      { label: "공개 요약", value: status.evidence.summaryPublished ? "저장됨" : "없음" },
      { label: "하이라이트", value: `${nonNegative(status.evidence.highlightCount)}개` },
      { label: "한줄평", value: `${nonNegative(status.evidence.oneLinerCount)}개` },
      { label: "피드백 문서", value: feedbackLabel(status.evidence.feedbackDocumentState) },
      { label: "최근 알림", value: status.evidence.latestNotificationEvent?.status ?? "없음" },
    ],
  };
}

function primaryAction(status: HostSessionClosingStatusResponse) {
  switch (status.overall.primaryAction) {
    case "CLOSE_SESSION":
      return { label: "세션 종료 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "IMPORT_RECORDS":
      return { label: "기록 패키지 확인", href: `/app/host/sessions/${status.session.sessionId}/edit?records=json` };
    case "PUBLISH_RECORDS":
      return { label: "공개 기록 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "SEND_NOTIFICATION":
      return { label: "멤버 알림 확인", href: "/app/host/notifications" };
    case "REVIEW_PUBLIC_PAGE":
      return { label: "공개 기록 보기", href: status.evidence.publicRecordHref };
    case "NONE":
      return { label: "추가 작업 없음", href: null };
  }
}

function overallTone(state: HostSessionClosingStatusResponse["overall"]["state"]): SessionClosingTone {
  if (state === "PUBLISHED") return "ok";
  if (state === "READY") return "accent";
  if (state === "BLOCKED") return "danger";
  if (state === "IN_PROGRESS") return "warn";
  return "muted";
}

function checklistTone(state: HostSessionClosingChecklistState): SessionClosingTone {
  if (state === "DONE") return "ok";
  if (state === "BLOCKED") return "danger";
  if (state === "ACTION_REQUIRED") return "warn";
  return "muted";
}

function feedbackLabel(state: HostSessionClosingStatusResponse["evidence"]["feedbackDocumentState"]) {
  if (state === "AVAILABLE") return "준비됨";
  if (state === "INVALID") return "확인 필요";
  if (state === "LOCKED") return "잠김";
  return "없음";
}

function visibilityLabel(value: HostSessionClosingStatusResponse["session"]["recordVisibility"]) {
  if (value === "PUBLIC") return "공개";
  if (value === "MEMBER") return "멤버 공개";
  return "호스트 전용";
}

function hostSurfaceDetail(status: HostSessionClosingStatusResponse) {
  return status.overall.state === "BLOCKED" ? "차단 사유를 먼저 확인해야 합니다." : "운영 체크리스트를 확인할 수 있습니다.";
}

function memberSurfaceDetail(status: HostSessionClosingStatusResponse) {
  return status.evidence.memberReflectionHref ? "멤버 회고 진입이 준비되었습니다." : "멤버 회고 진입을 아직 확인할 수 없습니다.";
}

function publicSurfaceDetail(status: HostSessionClosingStatusResponse) {
  return status.evidence.publicRecordHref ? "공개 기록에서 확인할 수 있습니다." : "공개 표면에는 아직 노출되지 않습니다.";
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
```

- [ ] **Step 6: Run frontend targeted test**

Run:

```bash
pnpm --dir front test -- session-closing-model
```

Expected: PASS.

- [ ] **Step 7: Commit frontend contract/model**

```bash
git add front/features/host/api/host-contracts.ts front/features/host/api/host-api.ts front/features/host/queries/host-session-queries.ts front/features/host/model/session-closing-model.ts front/features/host/model/session-closing-model.test.ts
git commit -m "feat(front): add host session closing contract"
```

---

### Task 4: Host Closing Board Route and UI

**Files:**
- Create: `front/features/host/route/host-session-closing-data.ts`
- Create: `front/features/host/route/host-session-closing-route.tsx`
- Create: `front/features/host/ui/session-closing-board.tsx`
- Create: `front/features/host/ui/session-closing-board.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/src/app/host-route-elements.tsx`

**Interfaces:**
- Consumes: Task 3 `hostSessionClosingStatusQuery`, `getSessionClosingBoardView`.
- Produces: lazy host route for `sessions/:sessionId/closing`.

- [ ] **Step 1: Write UI test**

Create `front/features/host/ui/session-closing-board.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { SessionClosingBoard } from "./session-closing-board";

const view: SessionClosingBoardView = {
  title: "No.07 · E2E 책",
  subtitle: "2026-06-18 · 공개",
  statusLabel: "발행 준비",
  statusTone: "accent",
  primaryAction: { label: "멤버 알림 확인", href: "/app/host/notifications" },
  checklist: [
    { id: "SESSION_CLOSED", label: "세션 종료", detail: "닫힘", state: "DONE", tone: "ok", href: "/app/host/sessions/s1/edit" },
    { id: "MEMBER_NOTIFICATION_SENT", label: "멤버 알림 발송", detail: "대기", state: "ACTION_REQUIRED", tone: "warn", href: "/app/host/notifications" },
  ],
  surfaces: [
    { id: "HOST", title: "Host", detail: "운영 체크리스트", tone: "accent", href: "/app/host/sessions/s1/edit" },
    { id: "MEMBER", title: "Member", detail: "멤버 회고 진입", tone: "ok", href: "/clubs/club-a/app/sessions/s1" },
    { id: "PUBLIC", title: "Public", detail: "공개 기록", tone: "ok", href: "/clubs/club-a/sessions/s1" },
  ],
  evidence: [
    { label: "공개 요약", value: "저장됨" },
    { label: "하이라이트", value: "2개" },
  ],
};

describe("SessionClosingBoard", () => {
  it("renders primary action checklist surfaces and evidence", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.getByRole("heading", { name: "No.07 · E2E 책" })).toBeVisible();
    expect(screen.getByRole("link", { name: "멤버 알림 확인" })).toHaveAttribute("href", "/app/host/notifications");
    expect(screen.getByText("세션 종료")).toBeVisible();
    expect(screen.getByText("Host")).toBeVisible();
    expect(screen.getByText("Member")).toBeVisible();
    expect(screen.getByText("Public")).toBeVisible();
    expect(screen.getByText("하이라이트")).toBeVisible();
  });

  it("does not render private sentinels", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
    expect(screen.queryByText("{\"")).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
pnpm --dir front test -- session-closing-board
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add UI component**

Create `front/features/host/ui/session-closing-board.tsx`:

```tsx
import type { SessionClosingBoardView, SessionClosingTone } from "@/features/host/model/session-closing-model";

type SessionClosingBoardProps = {
  view: SessionClosingBoardView;
};

export function SessionClosingBoard({ view }: SessionClosingBoardProps) {
  return (
    <main className="rm-host-closing-board">
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">세션 클로징</div>
              <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>{view.title}</h1>
              <p className="body muted" style={{ margin: 0 }}>{view.subtitle}</p>
            </div>
            <span className={badgeClass(view.statusTone)}>{view.statusLabel}</span>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingTop: 24, paddingBottom: 72 }}>
        <section className="rm-reading-desk" aria-label="다음 행동" style={{ padding: 20, marginBottom: 16 }}>
          <div className="row-between" style={{ gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">다음 행동</div>
              <p className="h3 editorial" style={{ margin: "8px 0 0" }}>{view.primaryAction.label}</p>
            </div>
            {view.primaryAction.href ? (
              <a className="btn btn-primary" href={view.primaryAction.href}>{view.primaryAction.label}</a>
            ) : null}
          </div>
        </section>

        <section className="surface" aria-label="클로징 체크리스트" style={{ padding: 20, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>체크리스트</div>
          <div style={{ display: "grid", gap: 8 }}>
            {view.checklist.map((item) => (
              <article key={item.id} className="surface-quiet" style={{ padding: "14px 16px" }}>
                <div className="row-between" style={{ gap: 12, alignItems: "baseline" }}>
                  <strong>{item.label}</strong>
                  <span className={badgeClass(item.tone)}>{checklistStateLabel(item.state)}</span>
                </div>
                <p className="small muted" style={{ margin: "6px 0 0" }}>{item.detail}</p>
                {item.href ? <a className="tiny mono" href={item.href}>열기</a> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface" aria-label="표면별 상태" style={{ padding: 20, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Host / Member / Public</div>
          <div className="rm-host-closing-board__surfaces">
            {view.surfaces.map((surface) => (
              <article key={surface.id} className="surface-quiet" style={{ padding: 16 }}>
                <div className="row-between" style={{ gap: 12 }}>
                  <h2 className="h3 editorial" style={{ margin: 0 }}>{surface.title}</h2>
                  <span className={badgeClass(surface.tone)}>{surface.id}</span>
                </div>
                <p className="body muted" style={{ margin: "10px 0 0" }}>{surface.detail}</p>
                {surface.href ? <a className="btn btn-quiet btn-sm" href={surface.href} style={{ marginTop: 12 }}>확인</a> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface" aria-label="증거 장부" style={{ padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>증거 장부</div>
          <dl className="rm-host-closing-board__evidence">
            {view.evidence.map((item) => (
              <div key={item.label}>
                <dt className="tiny muted">{item.label}</dt>
                <dd className="body" style={{ margin: "4px 0 0" }}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  );
}

function checklistStateLabel(state: SessionClosingBoardView["checklist"][number]["state"]) {
  if (state === "DONE") return "완료";
  if (state === "BLOCKED") return "차단";
  if (state === "NOT_APPLICABLE") return "해당 없음";
  return "필요";
}

function badgeClass(tone: SessionClosingTone) {
  if (tone === "ok") return "badge badge-ok badge-dot";
  if (tone === "danger") return "badge badge-danger badge-dot";
  if (tone === "warn") return "badge badge-warn badge-dot";
  if (tone === "accent") return "badge badge-accent badge-dot";
  return "badge badge-dot";
}
```

Append this CSS near the host dashboard styles in `front/src/styles/globals.css`:

```css
.rm-host-closing-board__surfaces {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.rm-host-closing-board__evidence {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

@media (max-width: 760px) {
  .rm-host-closing-board__surfaces,
  .rm-host-closing-board__evidence {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Add loader and route**

Create `front/features/host/route/host-session-closing-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { hostSessionClosingStatusQuery } from "@/features/host/queries/host-session-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostSessionClosingRouteData = {
  sessionId: string;
};

export function hostSessionClosingLoaderFactory(client: QueryClient) {
  return async (args: LoaderFunctionArgs): Promise<HostSessionClosingRouteData> => {
    await requireHostLoaderAuth(args);
    const sessionId = args.params.sessionId;
    if (!sessionId) {
      throw new Error("Missing host session id");
    }
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    await client.fetchQuery(hostSessionClosingStatusQuery(sessionId, context));
    return { sessionId };
  };
}
```

Create `front/features/host/route/host-session-closing-route.tsx`:

```tsx
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { hostSessionClosingStatusQuery } from "@/features/host/queries/host-session-queries";
import { SessionClosingBoard } from "@/features/host/ui/session-closing-board";
import type { HostSessionClosingRouteData } from "./host-session-closing-data";

export function HostSessionClosingRoute() {
  const loaderData = useLoaderData() as HostSessionClosingRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const query = useQuery(hostSessionClosingStatusQuery(sessionId, context));

  if (!query.data) {
    return null;
  }

  return <SessionClosingBoard view={getSessionClosingBoardView(query.data)} />;
}
```

Modify `front/src/app/host-route-elements.tsx`:

```tsx
import { HostSessionClosingRoute } from "@/features/host/route/host-session-closing-route";

export function HostSessionClosingRouteElement() {
  return <HostSessionClosingRoute />;
}
```

Modify `front/src/app/routes/host.tsx` by adding before the `sessions/:sessionId/edit` route:

```tsx
{
  path: "sessions/:sessionId/closing",
  errorElement: <HostRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="세션 클로징 상태를 불러오는 중" variant="host" />,
  lazy: async () => {
    const [{ HostSessionClosingRouteElement }, { hostSessionClosingLoaderFactory }] = await Promise.all([
      import("@/src/app/host-route-elements"),
      import("@/features/host/route/host-session-closing-data"),
    ]);
    return { Component: HostSessionClosingRouteElement, loader: hostSessionClosingLoaderFactory(queryClient) };
  },
},
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm --dir front test -- session-closing-board session-closing-model
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 6: Commit host closing board**

```bash
git add front/features/host front/src/app/routes/host.tsx front/src/app/host-route-elements.tsx
git commit -m "feat(front): add host session closing board"
```

---

### Task 5: Member Notification Reflection Links

**Files:**
- Create: `front/features/notifications/model/notification-link-model.ts`
- Create: `front/features/notifications/model/notification-link-model.test.ts`
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Create: `front/features/notifications/ui/member-notifications-page.test.tsx`

**Interfaces:**
- Consumes: existing `MemberNotificationItem.deepLinkPath`.
- Produces: safe normalized href and optional reflection action labels.

- [ ] **Step 1: Write notification link model test**

Create `front/features/notifications/model/notification-link-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMemberNotificationLinkView } from "./notification-link-model";

describe("getMemberNotificationLinkView", () => {
  it("maps session deep links to member reflection action", () => {
    const view = getMemberNotificationLinkView("/sessions/11111111-1111-1111-1111-111111111111");

    expect(view.href).toBe("/app/sessions/11111111-1111-1111-1111-111111111111");
    expect(view.primaryActionLabel).toBe("기록 보기");
    expect(view.reflectionLabel).toBe("지난 모임 회고");
  });

  it("maps feedback document index safely", () => {
    const view = getMemberNotificationLinkView("/feedback-documents");

    expect(view.href).toBe("/app/archive?view=report");
    expect(view.primaryActionLabel).toBe("피드백 보기");
  });

  it("falls back for unsafe deep links", () => {
    expect(getMemberNotificationLinkView("//evil.example.com").href).toBe("/app/notifications");
    expect(getMemberNotificationLinkView("https://evil.example.com").href).toBe("/app/notifications");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --dir front test -- notification-link-model
```

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Add notification link model**

Create `front/features/notifications/model/notification-link-model.ts`:

```ts
export type MemberNotificationLinkView = {
  href: string;
  primaryActionLabel: "열기" | "기록 보기" | "피드백 보기" | "다음 읽기";
  reflectionLabel: "지난 모임 회고" | null;
};

export function getMemberNotificationLinkView(deepLinkPath: string): MemberNotificationLinkView {
  if (!deepLinkPath.startsWith("/") || deepLinkPath.startsWith("//")) {
    return fallback();
  }

  if (deepLinkPath.startsWith("/app/")) {
    return { href: deepLinkPath, primaryActionLabel: "열기", reflectionLabel: null };
  }

  if (deepLinkPath.startsWith("/sessions/")) {
    return {
      href: `/app${deepLinkPath}`,
      primaryActionLabel: "기록 보기",
      reflectionLabel: "지난 모임 회고",
    };
  }

  if (deepLinkPath.startsWith("/feedback-documents")) {
    return {
      href: "/app/archive?view=report",
      primaryActionLabel: "피드백 보기",
      reflectionLabel: "지난 모임 회고",
    };
  }

  if (deepLinkPath.startsWith("/notes")) {
    return { href: `/app${deepLinkPath}`, primaryActionLabel: "다음 읽기", reflectionLabel: null };
  }

  return { href: deepLinkPath, primaryActionLabel: "열기", reflectionLabel: null };
}

function fallback(): MemberNotificationLinkView {
  return { href: "/app/notifications", primaryActionLabel: "열기", reflectionLabel: null };
}
```

- [ ] **Step 4: Wire notification UI**

Modify `front/features/notifications/ui/member-notifications-page.tsx`:

```tsx
import { getMemberNotificationLinkView } from "@/features/notifications/model/notification-link-model";
```

Replace the local `notificationHref` function usage with:

```tsx
const linkView = getMemberNotificationLinkView(item.deepLinkPath);
const href = scopedAppLinkTarget(routePathname, linkView.href);
```

Below the body paragraph for each notification, render action labels:

```tsx
<div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
  {linkView.reflectionLabel ? <span className="badge badge-accent badge-dot">{linkView.reflectionLabel}</span> : null}
  <span className="tiny mono">{linkView.primaryActionLabel}</span>
</div>
```

Keep the existing click behavior: unread primary link activation still calls `onOpenNotification(item.id, href)`.

- [ ] **Step 5: Add UI test**

Create `front/features/notifications/ui/member-notifications-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberNotificationsPage } from "./member-notifications-page";

describe("MemberNotificationsPage", () => {
  it("shows reflection action for session notification without private sentinels", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 모임 기록이 준비되었습니다",
          body: "기록과 피드백을 이어서 볼 수 있습니다.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        }]}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText("지난 모임 회고")).toBeVisible();
    expect(screen.getByText("기록 보기")).toBeVisible();
    expect(screen.getByRole("link", { name: /No.07 모임 기록/ })).toHaveAttribute("href", "/app/sessions/11111111-1111-1111-1111-111111111111");
    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir front test -- notification-link-model member-notifications-page
```

Expected: PASS.

- [ ] **Step 7: Commit member notification loop**

```bash
git add front/features/notifications
git commit -m "feat(front): connect notifications to reflection loop"
```

---

### Task 6: Public Records Showcase

**Files:**
- Modify: `front/features/public/model/public-display-model.ts`
- Create: `front/features/public/model/public-display-model.test.ts`
- Modify: `front/features/public/ui/public-records-page.tsx`
- Modify: `front/features/public/ui/public-session.tsx`
- Test: `front/features/public/ui/public-records-page.test.tsx`
- Create: `front/features/public/ui/public-session.test.tsx`

**Interfaces:**
- Consumes: existing public API fields: summary, highlightCount, oneLinerCount, highlights, oneLiners.
- Produces: display-only showcase labels without server contract changes.

- [ ] **Step 1: Write public model tests**

Create `front/features/public/model/public-display-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPublicRecordShowcaseDisplay, getPublicSessionShowcaseDisplay } from "./public-display-model";

describe("public showcase display", () => {
  it("labels rich public record without inventing private state", () => {
    const display = getPublicRecordShowcaseDisplay({
      sessionId: "s1",
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "긴 대화의 공개 요약입니다.",
      highlightCount: 3,
      oneLinerCount: 2,
    });

    expect(display.recordDensityLabel).toBe("하이라이트 3 · 한줄평 2");
    expect(display.showcaseStateLabel).toBe("기록 준비됨");
    expect(JSON.stringify(display)).not.toContain("HOST");
    expect(JSON.stringify(display)).not.toContain("member1@example.com");
  });

  it("keeps sparse public session honest", () => {
    const display = getPublicSessionShowcaseDisplay({
      sessionId: "s1",
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "",
      highlights: [],
      oneLiners: [],
    });

    expect(display.showcaseStateLabel).toBe("요약 중심 기록");
  });
});
```

- [ ] **Step 2: Run failing model test**

Run:

```bash
pnpm --dir front test -- public-display-model
```

Expected: FAIL until helpers exist.

- [ ] **Step 3: Add display helpers**

Modify `front/features/public/model/public-display-model.ts`:

```ts
export function getPublicRecordShowcaseDisplay(session: PublicSessionListItemView) {
  const display = getPublicSessionListItemDisplay(session);
  const highlightCount = display.highlightCount;
  const oneLinerCount = display.oneLinerCount;
  const total = highlightCount + oneLinerCount;

  return {
    ...display,
    recordDensityLabel: `하이라이트 ${highlightCount} · 한줄평 ${oneLinerCount}`,
    showcaseStateLabel: total > 0 ? "기록 준비됨" : "요약 중심 기록",
    summaryLead: total > 0 ? "함께 남긴 문장과 감상" : "공개 요약",
  };
}

export function getPublicSessionShowcaseDisplay(session: PublicSessionDetailView) {
  const display = getPublicSessionDetailDisplay(session);
  const highlightCount = session.highlights.length;
  const oneLinerCount = session.oneLiners.length;
  const total = highlightCount + oneLinerCount;

  return {
    ...display,
    recordDensityLabel: `하이라이트 ${highlightCount} · 한줄평 ${oneLinerCount}`,
    showcaseStateLabel: total > 0 ? "기록 준비됨" : "요약 중심 기록",
  };
}
```

- [ ] **Step 4: Update public records UI**

Modify `front/features/public/ui/public-records-page.tsx` import:

```tsx
import { getPublicRecordsDisplay, getPublicRecordShowcaseDisplay } from "@/features/public/model/public-display-model";
```

Inside `PublicRecordIndexRow`, replace `const display = getPublicSessionListItemDisplay(session);` with:

```tsx
const display = getPublicRecordShowcaseDisplay(session);
```

Render a quiet showcase badge near counts:

```tsx
<span className="badge badge-dot">{display.showcaseStateLabel}</span>
```

Replace the count line with:

```tsx
<span>{display.recordDensityLabel}</span>
```

Keep the existing summary rendering and `PublicRecordIndexRow` link structure.

- [ ] **Step 5: Update public session detail UI**

Modify `front/features/public/ui/public-session.tsx` import:

```tsx
import { displayText, getPublicSessionShowcaseDisplay } from "@/features/public/model/public-display-model";
```

Replace:

```tsx
const { bookTitle, bookAuthor, dateLabel, summary } = getPublicSessionDetailDisplay(session);
```

with:

```tsx
const { bookTitle, bookAuthor, dateLabel, summary, recordDensityLabel, showcaseStateLabel } = getPublicSessionShowcaseDisplay(session);
```

In the document header, render:

```tsx
<span className="badge badge-dot">{showcaseStateLabel}</span>
<p className="small muted" style={{ margin: "8px 0 0" }}>{recordDensityLabel}</p>
```

Do not add member-only feedback links to the public page.

- [ ] **Step 6: Add UI tests**

Create `front/features/public/ui/public-session.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicSession from "./public-session";

describe("PublicSession showcase", () => {
  it("renders showcase labels without private surfaces", () => {
    render(
      <PublicSession
        session={{
          sessionId: "s1",
          sessionNumber: 7,
          bookTitle: "E2E 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-18",
          summary: "공개 요약",
          highlights: [{ text: "문장", sortOrder: 1, authorName: "독자A", authorShortName: "A" }],
          oneLiners: [{ authorName: "독자B", authorShortName: "B", text: "한줄평" }],
        }}
      />,
    );

    expect(screen.getByText("기록 준비됨")).toBeVisible();
    expect(screen.getByText("하이라이트 1 · 한줄평 1")).toBeVisible();
    expect(screen.queryByText(/피드백 문서/)).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });
});
```

- [ ] **Step 7: Run public tests**

Run:

```bash
pnpm --dir front test -- public-display-model public-session public-records
```

Expected: PASS.

- [ ] **Step 8: Commit public showcase**

```bash
git add front/features/public
git commit -m "feat(front): refine public records showcase"
```

---

### Task 7: End-to-End Flywheel Evidence

**Files:**
- Create: `front/tests/e2e/session-closing-flywheel.spec.ts`

**Interfaces:**
- Consumes: Tasks 3-6 UI/API contracts.
- Produces: Playwright proof that host closing status, member notification reflection, and public records links render public-safe.

- [ ] **Step 1: Write E2E spec**

Create `front/tests/e2e/session-closing-flywheel.spec.ts`:

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillHostAuth, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeHostClosing(page: Page) {
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route("**/api/bff/api/auth/me**", async (route) => fulfillHostAuth(route, CLUB_SLUG));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/closing-status`, async (route) => {
    await json(route, 200, {
      schema: "host.session_closing_status.v1",
      session: {
        sessionId: SESSION_ID,
        sessionNumber: 7,
        bookTitle: "E2E 책",
        meetingDate: "2026-06-18",
        state: "PUBLISHED",
        recordVisibility: "PUBLIC",
      },
      overall: { state: "PUBLISHED", label: "발행 완료", primaryAction: "REVIEW_PUBLIC_PAGE" },
      checklist: [
        { id: "SESSION_CLOSED", state: "DONE", label: "세션 종료", detail: "닫힘", href: `/app/host/sessions/${SESSION_ID}/edit` },
        { id: "RECORD_PACKAGE_SAVED", state: "DONE", label: "기록 패키지 저장", detail: "저장됨", href: `/app/host/sessions/${SESSION_ID}/edit?records=json` },
        { id: "FEEDBACK_DOCUMENT_READY", state: "DONE", label: "피드백 문서 준비", detail: "준비됨", href: `/app/host/sessions/${SESSION_ID}/edit?records=json` },
        { id: "MEMBER_NOTIFICATION_SENT", state: "DONE", label: "멤버 알림 발송", detail: "발송됨", href: "/app/host/notifications" },
        { id: "PUBLIC_RECORD_VISIBLE", state: "DONE", label: "공개 기록 노출", detail: "노출됨", href: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}` },
        { id: "PUBLIC_SHOWCASE_READY", state: "DONE", label: "공개 쇼케이스 확인", detail: "확인 가능", href: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}` },
      ],
      evidence: {
        summaryPublished: true,
        highlightCount: 2,
        oneLinerCount: 1,
        feedbackDocumentState: "AVAILABLE",
        latestNotificationEvent: {
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          status: "PUBLISHED",
          createdAt: "2026-06-18T10:00:00Z",
        },
        publicRecordHref: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}`,
        memberReflectionHref: `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`,
      },
    });
  });
}

async function routeMemberNotifications(page: Page) {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, {
      authenticated: true,
      userId: "member-user",
      membershipId: "member-a",
      clubId: "club-a-id",
      email: "member@example.com",
      displayName: "E2E 멤버",
      accountName: "E2E 멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      currentMembership: {
        membershipId: "member-a",
        clubId: "club-a-id",
        clubSlug: CLUB_SLUG,
        displayName: "E2E 멤버",
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      },
      joinedClubs: [],
      recommendedAppEntryUrl: `/clubs/${CLUB_SLUG}/app`,
    });
  });
  await page.route("**/api/bff/api/me/notifications**", async (route) => {
    await json(route, 200, {
      unreadCount: 1,
      nextCursor: null,
      items: [{
        id: "notification-1",
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        title: "No.07 모임 기록이 준비되었습니다",
        body: "지난 모임의 기록과 피드백을 이어 볼 수 있습니다.",
        deepLinkPath: `/sessions/${SESSION_ID}`,
        readAt: null,
        createdAt: "2026-06-18T10:00:00Z",
      }],
    });
  });
}

async function routePublicRecords(page: Page) {
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}`, async (route) => {
    await json(route, 200, {
      clubName: "읽는사이",
      tagline: "같이 읽는 모임",
      about: "공개 소개",
      stats: { sessions: 1, books: 1, members: 6 },
      recentSessions: [{
        sessionId: SESSION_ID,
        sessionNumber: 7,
        bookTitle: "E2E 책",
        bookAuthor: "저자",
        bookImageUrl: null,
        date: "2026-06-18",
        summary: "공개 가능한 요약입니다.",
        highlightCount: 2,
        oneLinerCount: 1,
      }],
    });
  });
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "공개 가능한 요약입니다.",
      highlights: [{ text: "남은 문장", sortOrder: 1, authorName: "독자A", authorShortName: "A" }],
      oneLiners: [{ authorName: "독자B", authorShortName: "B", text: "한줄평" }],
    });
  });
}

test("session closing flywheel links host member and public surfaces", async ({ page }, testInfo) => {
  await routeHostClosing(page);
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/closing`);
  await expect(page.getByRole("heading", { name: "No.07 · E2E 책" })).toBeVisible();
  await expect(page.getByText("발행 완료")).toBeVisible();
  await expect(page.getByText("Host")).toBeVisible();
  await expect(page.getByText("Member")).toBeVisible();
  await expect(page.getByText("Public")).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  const screenshot = await page.screenshot({ path: testInfo.outputPath("session-closing-board.png"), fullPage: true });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);

  await routeMemberNotifications(page);
  await page.goto(`/clubs/${CLUB_SLUG}/app/notifications`);
  await expect(page.getByText("지난 모임 회고")).toBeVisible();
  await expect(page.getByText("기록 보기")).toBeVisible();

  await routePublicRecords(page);
  await page.goto(`/clubs/${CLUB_SLUG}/records`);
  await expect(page.getByText("기록 준비됨")).toBeVisible();
  await expect(page.getByText("하이라이트 2 · 한줄평 1")).toBeVisible();
  await expect(page.getByText("피드백 문서")).toHaveCount(0);
});
```

- [ ] **Step 2: Run E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts
```

Expected: PASS and screenshot artifact exists only under Playwright test output.

- [ ] **Step 3: Commit E2E evidence**

```bash
git add front/tests/e2e/session-closing-flywheel.spec.ts
git commit -m "test(e2e): cover session closing flywheel"
```

---

### Task 8: Documentation, Release Evidence, and Full Verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: all shipped behavior.
- Produces: public-safe release note, architecture source-of-truth update, and closeout evidence.

- [ ] **Step 1: Update CHANGELOG**

Under `## Unreleased`, add:

```markdown
- **session closing flywheel:** 호스트가 회차별 클로징 상태를 별도 운영 보드에서 확인할 수 있게 하고, 멤버 알림의 지난 모임 회고 진입과 공개 기록 쇼케이스를 같은 회차 흐름으로 정리했습니다. 새 `sessionclosing` read model은 기존 세션·기록·피드백·알림·공개 기록 데이터를 host-safe projection으로 계산하며, DB migration은 없습니다.
```

- [ ] **Step 2: Update architecture doc**

Modify `docs/development/architecture.md` in the product surface and server slice sections:

```markdown
호스트 앱은 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차별 클로징 상태를 보여줍니다. 이 화면은 세션 종료, 기록 패키지, 피드백 문서, 멤버 알림, 공개 기록 노출을 하나의 host-safe read model로 묶고, member/public 표면에는 권한에 맞는 진입과 공개 가능한 기록만 노출합니다.
```

Add `sessionclosing` to the server package table:

```markdown
| Closing read model | `sessionclosing.adapter.in.web`, `sessionclosing.application.*`, `sessionclosing.adapter.out.persistence` | 기존 세션·기록·피드백·알림·공개 기록 데이터를 조합해 host-safe 회차 클로징 상태를 계산하는 read-side slice |
```

- [ ] **Step 3: Run full relevant checks**

Run:

```bash
git diff --check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
./server/gradlew -p server check
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- Frontend lint/test/build/E2E pass.
- Server `clean test`, `check`, and `architectureTest` pass.
- Public release candidate check reports no leaks.

- [ ] **Step 4: Record release-readiness evidence**

Append to `docs/development/release-readiness-review.md`:

```markdown
## 2026-06-18 Session closing flywheel closeout

- Scope reviewed: local `main..HEAD` for the session closing flywheel branch.
- Release classification: server read API plus host/member/public frontend behavior. No DB migration, auth/BFF token change, deploy script change, or CI workflow change.
- Product evidence: host closing board shows next action, checklist, Host/Member/Public status, and evidence ledger; member notifications show a 지난 모임 회고 action for session links; public records show record richness without host/member-only state.
- Public safety: raw email body, private member email sentinels, raw JSON sentinel, admin route sentinel, provider error, token-shaped values, and private deployment data are not rendered in production UI. Public release candidate generation and scanner passed.
- Local verification before merge: `git diff --check`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e`, `./server/gradlew -p server clean test`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after server, frontend, E2E, architecture, docs, and public-release evidence. Production deploy/tag smoke remains outside this local merge.
```

Adjust the evidence text to match actual command output if a command is skipped or fails before repair.

- [ ] **Step 5: Commit docs and release evidence**

```bash
git add CHANGELOG.md docs/development/architecture.md docs/development/release-readiness-review.md
git commit -m "docs: record session closing flywheel readiness"
```

---

## Final Review Checklist

- [ ] `sessionclosing` application package does not import web, JDBC, Redis, or adapter classes.
- [ ] `sessionclosing` controller does not inject `JdbcTemplate` or persistence adapter directly.
- [ ] Host Closing Board route works for both `/app/host/sessions/:sessionId/closing` and `/clubs/:slug/app/host/sessions/:sessionId/closing`.
- [ ] Member notification deep link fallback rejects non-relative and protocol-relative URLs.
- [ ] Public pages do not render feedback document links or host/member/admin-only state.
- [ ] No screenshot artifacts are tracked.
- [ ] `CHANGELOG.md` and `docs/development/architecture.md` describe the shipped behavior.
- [ ] Full verification commands in Task 8 pass or skipped commands are explicitly recorded with reasons.
