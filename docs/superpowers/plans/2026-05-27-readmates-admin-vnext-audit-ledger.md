# ReadMates Admin vNext Audit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship S7 `/admin/audit` as a read-only platform-admin audit ledger that safely unifies existing platform, club, notification replay, and AI audit records while preserving S8-compatible filter semantics.

**Architecture:** Add a dedicated read-only `com.readmates.admin.audit` server slice with source-specific query ports and allowlist projectors, then expose `/api/admin/audit/events` as a cursor page. On the frontend, follow the existing platform-admin route-first pattern with `api`, `model`, `queries`, `route`, and `ui` modules, flipping only the audit route from coming-soon to READY. Docs and release notes are updated only after behavior ships.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway existing tables, React/Vite, React Router, TanStack Query v5, Vitest, Playwright.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-05-27-readmates-admin-vnext-audit-ledger-design.md`
- Roadmap reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Architecture source of truth: `docs/development/architecture.md`
- Guides: `docs/agents/server.md`, `docs/agents/front.md`, `docs/agents/design.md`, `docs/agents/docs.md`

## File Structure

### Server

- Create `server/src/main/kotlin/com/readmates/admin/audit/application/model/AdminAuditModels.kt`
  - Shared request, filter, source row, ledger item, source state, cursor, and enum models.
- Create `server/src/main/kotlin/com/readmates/admin/audit/application/port/in/AdminAuditUseCases.kt`
  - `ListAdminAuditLedgerUseCase`.
- Create `server/src/main/kotlin/com/readmates/admin/audit/application/port/out/AdminAuditLedgerReadPort.kt`
  - Source-specific read methods for platform events, club events, AI audit rows, and replay previews.
- Create `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt`
  - Authorization, filter normalization, per-source failure isolation, merge/sort/page, cursor encoding, source projection.
- Create `server/src/main/kotlin/com/readmates/admin/audit/application/AdminAuditException.kt`
  - Typed invalid filter/cursor errors.
- Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`
  - Bounded source queries against existing audit tables.
- Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/PlatformAdminAuditController.kt`
  - `/api/admin/audit/events` endpoint, query parsing, response DTO mapping.
- Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/AdminAuditErrorHandler.kt`
  - Safe HTTP status mapping for invalid request errors.
- Test `server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerServiceTest.kt`
- Test `server/src/test/kotlin/com/readmates/admin/audit/api/PlatformAdminAuditControllerTest.kt`

### Frontend

- Create `front/features/platform-admin/model/platform-admin-audit-model.ts`
  - Response/request types, filter normalization, label helpers, URL parsing.
- Create `front/features/platform-admin/api/platform-admin-audit-api.ts`
  - BFF GET call for `/api/admin/audit/events`.
- Modify `front/features/platform-admin/api/platform-admin-contracts.ts`
  - Export audit types.
- Create `front/features/platform-admin/queries/platform-admin-audit-queries.ts`
  - Query keys and queryOptions.
- Create `front/features/platform-admin/route/admin-audit-data.ts`
  - Loader factory seeding the default filter.
- Create `front/features/platform-admin/route/admin-audit-route.tsx`
  - URL state, query execution, load-more coordination, UI props.
- Create `front/features/platform-admin/ui/admin-audit-ledger.tsx`
  - Filter toolbar, ledger rows, selected detail, empty/partial states.
- Modify `front/features/platform-admin/model/admin-route-catalog.ts`
  - Flip audit to READY and remove `comingSoon`.
- Modify `front/src/app/routes/admin.tsx`
  - Add ready child for `audit`.
- Modify `front/src/styles/globals.css`
  - Add restrained `admin-audit-*` styles.
- Test `front/features/platform-admin/model/platform-admin-audit-model.test.ts`
- Test `front/features/platform-admin/route/admin-audit-route.test.tsx`
- Test `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Modify `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Create `front/tests/e2e/admin-audit.spec.ts`
- Modify `front/tests/e2e/admin-shell.spec.ts`

### Docs

- Modify `CHANGELOG.md`
- Modify `docs/development/architecture.md`
- Modify `docs/development/server-state-migration.md`

---

## Task 1: Backend Models, Projection, And Service

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/model/AdminAuditModels.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/port/in/AdminAuditUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/port/out/AdminAuditLedgerReadPort.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/AdminAuditException.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerServiceTest.kt`

- [ ] **Step 1: Write the service test for merge order, masking, and malformed metadata**

Create `server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerServiceTest.kt` with these first tests. Keep the fake port local to the test file so the production interface can evolve without test fixtures leaking into app code.

```kotlin
package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminAuditLedgerServiceTest {
    @Test
    fun `merges source rows in reverse chronological order and returns opaque cursor`() {
        val readPort = FakeAdminAuditLedgerReadPort(
            platformRows = listOf(platformRow("platform-1", "2026-05-27T00:01:00Z")),
            clubRows = listOf(clubRow("club-1", "2026-05-27T00:02:00Z")),
            aiRows = listOf(aiRow("ai-1", "2026-05-27T00:00:00Z")),
            replayPreviewRows = listOf(replayPreviewRow("preview-1", "2026-05-27T00:03:00Z")),
        )
        val service = AdminAuditLedgerService(readPort)

        val page = service.listLedger(owner(), query(limit = 2))

        assertThat(page.items.map { it.id }).containsExactly(
            "admin_notification_replay_previews:preview-1",
            "club_audit_events:club-1",
        )
        assertThat(page.nextCursor).isNotBlank()
        assertThat(page.summary.visibleCount).isEqualTo(2)
    }

    @Test
    fun `support receives masked target labels for support grant rows`() {
        val readPort = FakeAdminAuditLedgerReadPort(
            platformRows = listOf(
                platformRow(
                    id = "support-create",
                    occurredAt = "2026-05-27T00:01:00Z",
                    eventType = "SUPPORT_ACCESS_GRANT_CREATED",
                    metadataJson = """{"grantId":"grant-1","clubId":"club-1","granteeUserId":"00000000-0000-0000-0000-000000000202","scope":"METADATA_READ","expiresAt":"2026-05-28T00:00:00Z"}""",
                ),
            ),
        )
        val service = AdminAuditLedgerService(readPort)

        val item = service.listLedger(support(), query()).items.single()

        assertThat(item.summary).contains("support grant")
        assertThat(item.target.label).isEqualTo("사용자 숨김")
        assertThat(item.safeMetadata.map { it.label }).contains("scope", "expiryBucket")
        assertThat(item.safeMetadata.map { it.value }).doesNotContain("00000000-0000-0000-0000-000000000202")
    }

    @Test
    fun `malformed metadata keeps row visible without raw json`() {
        val readPort = FakeAdminAuditLedgerReadPort(
            platformRows = listOf(
                platformRow(
                    id = "broken",
                    occurredAt = "2026-05-27T00:01:00Z",
                    eventType = "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
                    metadataJson = """{"previewId":""",
                ),
            ),
        )
        val service = AdminAuditLedgerService(readPort)

        val item = service.listLedger(owner(), query()).items.single()

        assertThat(item.metadataState.name).isEqualTo("UNAVAILABLE")
        assertThat(item.safeMetadata).isEmpty()
        assertThat(item.summary).doesNotContain("previewId")
    }

    private fun query(limit: Int = 25): AdminAuditListQuery =
        AdminAuditListQuery(
            filter = AdminAuditFilter.defaultNow(now = NOW),
            pageRequest = PageRequest.cursor(requestedLimit = limit, rawCursor = null, defaultLimit = 25, maxLimit = 50),
        )

    private fun owner(): CurrentPlatformAdmin =
        CurrentPlatformAdmin(ADMIN_USER_ID, "owner@example.com", PlatformAdminRole.OWNER)

    private fun support(): CurrentPlatformAdmin =
        CurrentPlatformAdmin(SUPPORT_USER_ID, "support@example.com", PlatformAdminRole.SUPPORT)
}
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest"
```

Expected: fail because the `com.readmates.admin.audit` package does not exist.

- [ ] **Step 3: Add model and port contracts**

Create `server/src/main/kotlin/com/readmates/admin/audit/application/model/AdminAuditModels.kt` with these concrete types.

```kotlin
package com.readmates.admin.audit.application.model

import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class AdminAuditListQuery(
    val filter: AdminAuditFilter,
    val pageRequest: PageRequest,
)

data class AdminAuditFilter(
    val from: OffsetDateTime,
    val to: OffsetDateTime,
    val range: AdminAuditTimeRange?,
    val clubId: UUID?,
    val actorRole: AdminAuditActorRole?,
    val sourceSlice: AdminAuditSourceSlice?,
    val actionCategory: AdminAuditActionCategory?,
    val outcome: AdminAuditOutcome?,
) {
    companion object {
        fun defaultNow(now: OffsetDateTime): AdminAuditFilter =
            AdminAuditFilter(
                from = now.minusDays(7),
                to = now,
                range = AdminAuditTimeRange.DAYS_7,
                clubId = null,
                actorRole = null,
                sourceSlice = null,
                actionCategory = null,
                outcome = null,
            )
    }
}

enum class AdminAuditTimeRange(val wireValue: String) {
    HOURS_24("24h"),
    DAYS_7("7d"),
    DAYS_30("30d"),
    DAYS_90("90d"),
}

enum class AdminAuditSourceSlice { S3, S4, S5, S6, PLATFORM, CLUB }
enum class AdminAuditActionCategory { NOTIFICATION, SUPPORT, CLUB_LIFECYCLE, AI_OPS, AUTH_SECURITY, PLATFORM_ADMIN }
enum class AdminAuditActorRole { OWNER, OPERATOR, SUPPORT, HOST, MEMBER, SYSTEM, UNKNOWN }
enum class AdminAuditOutcome { SUCCESS, FAILED, DENIED, PREPARED, UNKNOWN }
enum class AdminAuditMetadataState { AVAILABLE, EMPTY, UNAVAILABLE }
enum class AdminAuditSourceType(val tableName: String, val rank: Int) {
    PLATFORM("platform_audit_events", 10),
    CLUB("club_audit_events", 20),
    AI_GENERATION("ai_generation_audit_log", 30),
    NOTIFICATION_REPLAY_PREVIEW("admin_notification_replay_previews", 40),
}

data class AdminAuditSourceRow(
    val sourceType: AdminAuditSourceType,
    val sourceId: String,
    val occurredAt: OffsetDateTime,
    val actorUserId: UUID?,
    val actorRole: String?,
    val clubId: UUID?,
    val targetUserId: UUID?,
    val actionType: String,
    val outcomeHint: String?,
    val metadataJson: String?,
)

data class AdminAuditLedgerPage(
    val generatedAt: OffsetDateTime,
    val filters: AdminAuditFilter,
    val summary: AdminAuditSummary,
    val items: List<AdminAuditLedgerItem>,
    val nextCursor: String?,
) {
    fun toCursorPage(): CursorPage<AdminAuditLedgerItem> = CursorPage(items, nextCursor)
}

data class AdminAuditSummary(
    val visibleCount: Int,
    val sourceUnavailableCount: Int,
    val metadataUnavailableCount: Int,
    val unavailableSources: List<AdminAuditSourceType>,
)

data class AdminAuditLedgerItem(
    val id: String,
    val occurredAt: OffsetDateTime,
    val sourceSlice: AdminAuditSourceSlice,
    val sourceTable: String,
    val actionCategory: AdminAuditActionCategory,
    val actionType: String,
    val outcome: AdminAuditOutcome,
    val actor: AdminAuditActor,
    val target: AdminAuditTarget,
    val summary: String,
    val safeMetadata: List<AdminAuditMetadata>,
    val metadataState: AdminAuditMetadataState,
)

data class AdminAuditActor(
    val userId: UUID?,
    val role: AdminAuditActorRole,
    val displayLabel: String,
)

data class AdminAuditTarget(
    val clubId: UUID?,
    val userId: UUID?,
    val jobId: UUID?,
    val eventId: String?,
    val label: String,
)

data class AdminAuditMetadata(
    val label: String,
    val value: String,
    val kind: String,
)

fun OffsetDateTime.utc(): OffsetDateTime = withOffsetSameInstant(ZoneOffset.UTC)
```

Create `server/src/main/kotlin/com/readmates/admin/audit/application/port/in/AdminAuditUseCases.kt`.

```kotlin
package com.readmates.admin.audit.application.port.`in`

import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.shared.security.CurrentPlatformAdmin

interface ListAdminAuditLedgerUseCase {
    fun listLedger(
        admin: CurrentPlatformAdmin,
        query: AdminAuditListQuery,
    ): AdminAuditLedgerPage
}
```

Create `server/src/main/kotlin/com/readmates/admin/audit/application/port/out/AdminAuditLedgerReadPort.kt`.

```kotlin
package com.readmates.admin.audit.application.port.out

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.shared.paging.PageRequest

interface AdminAuditLedgerReadPort {
    fun listPlatformEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listClubEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listAiGenerationEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>

    fun listNotificationReplayPreviews(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow>
}
```

Create `server/src/main/kotlin/com/readmates/admin/audit/application/AdminAuditException.kt`.

```kotlin
package com.readmates.admin.audit.application

enum class AdminAuditError {
    INVALID_FILTER,
    INVALID_CURSOR,
}

class AdminAuditException(
    val error: AdminAuditError,
    message: String,
) : RuntimeException(message)
```

- [ ] **Step 4: Add the service with source projection and cursor handling**

Create `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt`.

```kotlin
package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditActor
import com.readmates.admin.audit.application.model.AdminAuditActorRole
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditLedgerItem
import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditMetadata
import com.readmates.admin.audit.application.model.AdminAuditMetadataState
import com.readmates.admin.audit.application.model.AdminAuditOutcome
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditSummary
import com.readmates.admin.audit.application.model.AdminAuditTarget
import com.readmates.admin.audit.application.port.`in`.ListAdminAuditLedgerUseCase
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.architecture.ReadOnlyApplicationService
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@ReadOnlyApplicationService
class AdminAuditLedgerService(
    private val readPort: AdminAuditLedgerReadPort,
    private val objectMapper: ObjectMapper = ObjectMapper(),
) : ListAdminAuditLedgerUseCase {
    override fun listLedger(
        admin: CurrentPlatformAdmin,
        query: AdminAuditListQuery,
    ): AdminAuditLedgerPage {
        validateFilter(query.filter)
        val requestedLimit = query.pageRequest.limit.coerceIn(1, MAX_LIMIT)
        val sourcePage = query.pageRequest.copy(limit = requestedLimit + 1)
        val unavailable = mutableListOf<AdminAuditSourceType>()
        val sourceRows =
            buildList {
                addAll(readSource(unavailable, AdminAuditSourceType.PLATFORM) { readPort.listPlatformEvents(query.filter, sourcePage) })
                addAll(readSource(unavailable, AdminAuditSourceType.CLUB) { readPort.listClubEvents(query.filter, sourcePage) })
                addAll(readSource(unavailable, AdminAuditSourceType.AI_GENERATION) { readPort.listAiGenerationEvents(query.filter, sourcePage) })
                addAll(readSource(unavailable, AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW) { readPort.listNotificationReplayPreviews(query.filter, sourcePage) })
            }

        val projected =
            sourceRows
                .map { project(admin, it) }
                .filter { matchesQueryFilter(query.filter, it) }
                .sortedWith(compareByDescending<AdminAuditLedgerItem> { it.occurredAt }.thenBy { sourceRank(it.sourceTable) }.thenByDescending { it.id })

        val visible = projected.take(requestedLimit)
        val nextCursor = projected.drop(requestedLimit).firstOrNull()?.let(::encodeCursor)
        return AdminAuditLedgerPage(
            generatedAt = OffsetDateTime.now(ZoneOffset.UTC),
            filters = query.filter,
            summary =
                AdminAuditSummary(
                    visibleCount = visible.size,
                    sourceUnavailableCount = unavailable.size,
                    metadataUnavailableCount = visible.count { it.metadataState == AdminAuditMetadataState.UNAVAILABLE },
                    unavailableSources = unavailable,
                ),
            items = visible,
            nextCursor = nextCursor,
        )
    }

    private fun validateFilter(filter: AdminAuditFilter) {
        if (!filter.from.isBefore(filter.to)) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "from must be before to")
        }
        if (filter.from.isBefore(filter.to.minusDays(90))) {
            throw AdminAuditException(AdminAuditError.INVALID_FILTER, "audit range cannot exceed 90 days")
        }
    }

    private fun readSource(
        unavailable: MutableList<AdminAuditSourceType>,
        source: AdminAuditSourceType,
        read: () -> List<AdminAuditSourceRow>,
    ): List<AdminAuditSourceRow> =
        runCatching(read).getOrElse {
            unavailable += source
            emptyList()
        }

    private fun project(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem =
        when (row.sourceType) {
            AdminAuditSourceType.PLATFORM -> projectPlatform(admin, row)
            AdminAuditSourceType.CLUB -> projectClub(admin, row)
            AdminAuditSourceType.AI_GENERATION -> projectAi(admin, row)
            AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW -> projectReplayPreview(admin, row)
        }

    private fun projectPlatform(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val metadataUnavailable = row.metadataJson != null && metadata == null
        val sourceSlice =
            when (row.actionType) {
                "SUPPORT_ACCESS_GRANT_CREATED", "SUPPORT_ACCESS_GRANT_REVOKED" -> AdminAuditSourceSlice.S4
                "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" -> AdminAuditSourceSlice.S5
                else -> AdminAuditSourceSlice.PLATFORM
            }
        val category =
            when (sourceSlice) {
                AdminAuditSourceSlice.S4 -> AdminAuditActionCategory.SUPPORT
                AdminAuditSourceSlice.S5 -> AdminAuditActionCategory.NOTIFICATION
                else -> AdminAuditActionCategory.PLATFORM_ADMIN
            }
        val targetUser = row.targetUserId.takeUnless { admin.role == PlatformAdminRole.SUPPORT }
        val safeMetadata =
            if (metadata == null) {
                emptyList()
            } else {
                platformMetadata(row.actionType, metadata, admin.role)
            }
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt,
            sourceSlice = sourceSlice,
            sourceTable = row.sourceType.tableName,
            actionCategory = category,
            actionType = row.actionType,
            outcome = AdminAuditOutcome.SUCCESS,
            actor = actor(row.actorUserId, row.actorRole),
            target =
                AdminAuditTarget(
                    clubId = row.clubId ?: metadata?.uuid("clubId"),
                    userId = targetUser,
                    jobId = null,
                    eventId = metadata?.string("eventId"),
                    label = if (admin.role == PlatformAdminRole.SUPPORT && row.targetUserId != null) "사용자 숨김" else row.targetUserId?.toString() ?: "대상 없음",
                ),
            summary = platformSummary(row.actionType),
            safeMetadata = safeMetadata,
            metadataState = metadataState(metadata, metadataUnavailable),
        )
    }

    private fun projectClub(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem =
        AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt,
            sourceSlice = AdminAuditSourceSlice.S3,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.CLUB_LIFECYCLE,
            actionType = row.actionType,
            outcome = AdminAuditOutcome.SUCCESS,
            actor = actor(row.actorUserId, row.actorRole),
            target = AdminAuditTarget(row.clubId, null, null, null, row.clubId?.toString() ?: "클럽"),
            summary = "클럽 운영 상태가 변경되었습니다.",
            safeMetadata = listOf(AdminAuditMetadata("eventType", row.actionType, "code")),
            metadataState = AdminAuditMetadataState.AVAILABLE,
        )

    private fun projectAi(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        val status = metadata?.string("status") ?: row.outcomeHint ?: "UNKNOWN"
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt,
            sourceSlice = AdminAuditSourceSlice.S6,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.AI_OPS,
            actionType = row.actionType,
            outcome = if (status == "FAILED") AdminAuditOutcome.FAILED else AdminAuditOutcome.SUCCESS,
            actor = actor(row.actorUserId, row.actorRole ?: "HOST"),
            target = AdminAuditTarget(row.clubId, null, metadata?.uuid("jobId"), null, metadata?.string("jobId") ?: "AI job"),
            summary = "AI 작업 감사 이벤트가 기록되었습니다.",
            safeMetadata = aiMetadata(metadata),
            metadataState = metadataState(metadata, metadata == null && row.metadataJson != null),
        )
    }

    private fun projectReplayPreview(
        admin: CurrentPlatformAdmin,
        row: AdminAuditSourceRow,
    ): AdminAuditLedgerItem {
        val metadata = parseMetadata(row.metadataJson)
        return AdminAuditLedgerItem(
            id = "${row.sourceType.tableName}:${row.sourceId}",
            occurredAt = row.occurredAt,
            sourceSlice = AdminAuditSourceSlice.S5,
            sourceTable = row.sourceType.tableName,
            actionCategory = AdminAuditActionCategory.NOTIFICATION,
            actionType = "ADMIN_NOTIFICATION_REPLAY_PREVIEW",
            outcome = AdminAuditOutcome.PREPARED,
            actor = actor(row.actorUserId, row.actorRole),
            target = AdminAuditTarget(row.clubId, null, null, row.sourceId, "Replay preview"),
            summary = "알림 재처리 대상이 미리 확인되었습니다.",
            safeMetadata = replayPreviewMetadata(metadata),
            metadataState = metadataState(metadata, metadata == null && row.metadataJson != null),
        )
    }

    private fun actor(
        actorUserId: UUID?,
        actorRole: String?,
    ): AdminAuditActor {
        val role = actorRole.toActorRole()
        return AdminAuditActor(
            userId = actorUserId,
            role = role,
            displayLabel = role.name,
        )
    }

    private fun platformMetadata(
        actionType: String,
        metadata: Map<String, Any?>,
        role: PlatformAdminRole,
    ): List<AdminAuditMetadata> =
        when (actionType) {
            "SUPPORT_ACCESS_GRANT_CREATED" ->
                listOfNotNull(
                    metadata.string("grantId")?.let { AdminAuditMetadata("grantId", it, "id") },
                    metadata.string("scope")?.let { AdminAuditMetadata("scope", it, "code") },
                    metadata.string("expiresAt")?.let { AdminAuditMetadata("expiryBucket", expiryBucket(it), "time") },
                )
            "SUPPORT_ACCESS_GRANT_REVOKED" ->
                listOfNotNull(metadata.string("grantId")?.let { AdminAuditMetadata("grantId", it, "id") })
            "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" ->
                listOfNotNull(
                    metadata.string("previewId")?.let { AdminAuditMetadata("previewId", it, "id") },
                    metadata.string("selectionHash")?.take(8)?.let { AdminAuditMetadata("selectionHashPrefix", it, "fingerprint") },
                    metadata.number("replayedCount")?.let { AdminAuditMetadata("replayedCount", it, "count") },
                    metadata.number("skippedCount")?.let { AdminAuditMetadata("skippedCount", it, "count") },
                    AdminAuditMetadata("reasonPresent", metadata.string("reason")?.isNotBlank().toString(), "boolean"),
                )
            else -> listOf(AdminAuditMetadata("eventType", actionType, "code"))
        }

    private fun aiMetadata(metadata: Map<String, Any?>?): List<AdminAuditMetadata> =
        if (metadata == null) {
            emptyList()
        } else {
            listOfNotNull(
                metadata.string("provider")?.let { AdminAuditMetadata("provider", it, "code") },
                metadata.string("model")?.let { AdminAuditMetadata("model", it, "code") },
                metadata.string("status")?.let { AdminAuditMetadata("status", it, "code") },
                metadata.string("errorCode")?.let { AdminAuditMetadata("errorCode", it, "code") },
                metadata.number("costEstimateUsd")?.let { AdminAuditMetadata("costEstimateUsd", it, "money") },
                metadata.number("latencyMs")?.let { AdminAuditMetadata("latencyMs", it, "duration") },
            )
        }

    private fun replayPreviewMetadata(metadata: Map<String, Any?>?): List<AdminAuditMetadata> =
        if (metadata == null) {
            emptyList()
        } else {
            listOfNotNull(
                metadata.number("matchedCount")?.let { AdminAuditMetadata("matchedCount", it, "count") },
                metadata.string("selectionHash")?.take(8)?.let { AdminAuditMetadata("selectionHashPrefix", it, "fingerprint") },
                metadata.string("expiresAt")?.let { AdminAuditMetadata("expiresAt", it, "time") },
                metadata.string("consumedAt")?.let { AdminAuditMetadata("consumedAt", it, "time") },
            )
        }

    private fun metadataState(
        metadata: Map<String, Any?>?,
        unavailable: Boolean,
    ): AdminAuditMetadataState =
        when {
            unavailable -> AdminAuditMetadataState.UNAVAILABLE
            metadata == null || metadata.isEmpty() -> AdminAuditMetadataState.EMPTY
            else -> AdminAuditMetadataState.AVAILABLE
        }

    private fun parseMetadata(metadataJson: String?): Map<String, Any?>? =
        metadataJson?.let {
            runCatching {
                @Suppress("UNCHECKED_CAST")
                objectMapper.readValue(it, Map::class.java) as Map<String, Any?>
            }.getOrNull()
        }

    private fun matchesQueryFilter(
        filter: AdminAuditFilter,
        item: AdminAuditLedgerItem,
    ): Boolean =
        (filter.sourceSlice == null || item.sourceSlice == filter.sourceSlice) &&
            (filter.actionCategory == null || item.actionCategory == filter.actionCategory) &&
            (filter.outcome == null || item.outcome == filter.outcome) &&
            (filter.actorRole == null || item.actor.role == filter.actorRole) &&
            (filter.clubId == null || item.target.clubId == filter.clubId)

    private fun encodeCursor(item: AdminAuditLedgerItem): String? =
        CursorCodec.encode(
            mapOf(
                "occurredAt" to item.occurredAt.toString(),
                "sourceRank" to sourceRank(item.sourceTable).toString(),
                "sourceId" to item.id.substringAfter(":"),
            ),
        )

    private fun sourceRank(tableName: String): Int =
        AdminAuditSourceType.entries.firstOrNull { it.tableName == tableName }?.rank ?: 99
}

private fun String?.toActorRole(): AdminAuditActorRole =
    when (this) {
        "OWNER" -> AdminAuditActorRole.OWNER
        "OPERATOR" -> AdminAuditActorRole.OPERATOR
        "SUPPORT" -> AdminAuditActorRole.SUPPORT
        "HOST" -> AdminAuditActorRole.HOST
        "MEMBER" -> AdminAuditActorRole.MEMBER
        "SYSTEM" -> AdminAuditActorRole.SYSTEM
        else -> AdminAuditActorRole.UNKNOWN
    }

private fun platformSummary(actionType: String): String =
    when (actionType) {
        "SUPPORT_ACCESS_GRANT_CREATED" -> "support grant가 생성되었습니다."
        "SUPPORT_ACCESS_GRANT_REVOKED" -> "support grant가 회수되었습니다."
        "ADMIN_NOTIFICATION_REPLAY_CONFIRMED" -> "알림 재처리가 확정되었습니다."
        else -> "platform admin 이벤트가 기록되었습니다."
    }

private fun Map<String, Any?>.string(key: String): String? = this[key]?.toString()?.takeIf { it.isNotBlank() }
private fun Map<String, Any?>.number(key: String): String? = this[key]?.toString()?.takeIf { it.isNotBlank() }
private fun Map<String, Any?>.uuid(key: String): UUID? = string(key)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
private fun expiryBucket(value: String): String = if (value.contains("T")) "configured" else "unknown"

private const val MAX_LIMIT = 50
```

When implementing, keep the service code focused. If the projector functions make the file difficult to read, split them into `AdminAuditSourceProjectors.kt` in the same package during this task and update imports in the test.

- [ ] **Step 5: Complete test helpers and run the service test**

Add the fake port and row helpers to the bottom of `AdminAuditLedgerServiceTest.kt`.

```kotlin
private class FakeAdminAuditLedgerReadPort(
    private val platformRows: List<AdminAuditSourceRow> = emptyList(),
    private val clubRows: List<AdminAuditSourceRow> = emptyList(),
    private val aiRows: List<AdminAuditSourceRow> = emptyList(),
    private val replayPreviewRows: List<AdminAuditSourceRow> = emptyList(),
) : AdminAuditLedgerReadPort {
    override fun listPlatformEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> = platformRows
    override fun listClubEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> = clubRows
    override fun listAiGenerationEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> = aiRows
    override fun listNotificationReplayPreviews(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> = replayPreviewRows
}

private fun platformRow(
    id: String,
    occurredAt: String,
    eventType: String = "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
    metadataJson: String = """{"previewId":"preview-1","selectionHash":"aaaaaaaa","reason":"provider recovered","replayedCount":2,"skippedCount":0}""",
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        sourceType = AdminAuditSourceType.PLATFORM,
        sourceId = id,
        occurredAt = OffsetDateTime.parse(occurredAt),
        actorUserId = ADMIN_USER_ID,
        actorRole = "OWNER",
        clubId = CLUB_ID,
        targetUserId = MEMBER_USER_ID,
        actionType = eventType,
        outcomeHint = null,
        metadataJson = metadataJson,
    )

private fun clubRow(id: String, occurredAt: String): AdminAuditSourceRow =
    AdminAuditSourceRow(AdminAuditSourceType.CLUB, id, OffsetDateTime.parse(occurredAt), ADMIN_USER_ID, "OPERATOR", CLUB_ID, null, "CLUB_STATUS_CHANGED", null, "{}")

private fun aiRow(id: String, occurredAt: String): AdminAuditSourceRow =
    AdminAuditSourceRow(AdminAuditSourceType.AI_GENERATION, id, OffsetDateTime.parse(occurredAt), HOST_USER_ID, "HOST", CLUB_ID, null, "AI_GENERATION_AUDIT", "SUCCEEDED", """{"jobId":"$AI_JOB_ID","provider":"openai","model":"gpt-safe","status":"SUCCEEDED","costEstimateUsd":"0.0100","latencyMs":1200}""")

private fun replayPreviewRow(id: String, occurredAt: String): AdminAuditSourceRow =
    AdminAuditSourceRow(AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW, id, OffsetDateTime.parse(occurredAt), ADMIN_USER_ID, "OWNER", CLUB_ID, null, "ADMIN_NOTIFICATION_REPLAY_PREVIEW", "PREPARED", """{"matchedCount":2,"selectionHash":"aaaaaaaa","expiresAt":"2026-05-27T00:10:00Z"}""")

private val NOW: OffsetDateTime = OffsetDateTime.parse("2026-05-27T00:05:00Z")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private val SUPPORT_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
private val MEMBER_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val AI_JOB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000a111")
```

Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest"
```

Expected: pass after imports and ktlint formatting are fixed.

- [ ] **Step 6: Commit Task 1**

```bash
git add server/src/main/kotlin/com/readmates/admin/audit/application server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerServiceTest.kt
git commit -m "feat: add admin audit ledger projection service"
```

---

## Task 2: Backend Persistence, Controller, And Integration Tests

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/PlatformAdminAuditController.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/AdminAuditErrorHandler.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/audit/api/PlatformAdminAuditControllerTest.kt`
- Modify if needed: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Write the controller integration test**

Create `server/src/test/kotlin/com/readmates/admin/audit/api/PlatformAdminAuditControllerTest.kt`.

```kotlin
package com.readmates.admin.audit.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminAuditControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        jdbcTemplate.update("delete from platform_audit_events where id in (?, ?)", PLATFORM_EVENT_ID, SUPPORT_EVENT_ID)
        jdbcTemplate.update("delete from club_audit_events where id = ?", CLUB_EVENT_ID)
        jdbcTemplate.update("delete from ai_generation_audit_log where job_id = ?", AI_JOB_ID)
        jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", PREVIEW_ID)
        if (createdSessionTokenHashes.isNotEmpty()) {
            val bindMarks = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update("delete from auth_sessions where session_token_hash in ($bindMarks)", *createdSessionTokenHashes.toTypedArray())
        }
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `owner reads unified audit ledger without raw metadata leakage`() {
        seedAuditRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?range=7d&limit=10") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
                    jsonPath("$.generatedAt") { exists() }
                    jsonPath("$.items[0].sourceTable") { exists() }
                    jsonPath("$.items[?(@.actionType == 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED')]") { exists() }
                    jsonPath("$.items[?(@.actionType == 'SUPPORT_ACCESS_GRANT_CREATED')]") { exists() }
                    jsonPath("$.items[?(@.actionType == 'AI_GENERATION_AUDIT')]") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).contains("selectionHashPrefix")
        assertThat(body).doesNotContain("member1@example.com")
        assertThat(body).doesNotContain("SMTP 550")
        assertThat(body).doesNotContain("transcript body")
        assertThat(body).doesNotContain("\"metadataJson\"")
    }

    @Test
    fun `support can read ledger but target user id is masked`() {
        seedAuditRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?sourceSlice=S4") {
                    cookie(sessionCookieForUser(SUPPORT_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[0].target.label") { value("사용자 숨김") }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain(MEMBER_USER_ID)
    }

    @Test
    fun `member cannot read admin audit ledger`() {
        mockMvc
            .get("/api/admin/audit/events") {
                cookie(sessionCookieForUser(MEMBER_USER_ID))
            }.andExpect {
                status { isForbidden() }
            }
    }
}
```

- [ ] **Step 2: Run the failing integration test**

Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.admin.audit.api.PlatformAdminAuditControllerTest"
```

Expected: fail because `/api/admin/audit/events` is not mapped.

- [ ] **Step 3: Add the JDBC adapter**

Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`.

```kotlin
package com.readmates.admin.audit.adapter.out.persistence

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.shared.db.dbString
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAdminAuditLedgerAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminAuditLedgerReadPort {
    override fun listPlatformEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, actor_user_id, actor_platform_role, target_user_id, event_type,
                   cast(metadata_json as char) as metadata_json, created_at
            from platform_audit_events
            where created_at >= ? and created_at < ?
              and (? is null or json_unquote(json_extract(metadata_json, '$.clubId')) = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toPlatformRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listClubEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, actor_user_id, actor_platform_role, club_id, event_type,
                   cast(metadata_json as char) as metadata_json, created_at
            from club_audit_events
            where created_at >= ? and created_at < ?
              and (? is null or club_id = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toClubRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listAiGenerationEvents(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, job_id, club_id, host_user_id, kind, provider, model, status, error_code,
                   input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            from ai_generation_audit_log
            where created_at >= ? and created_at < ?
              and (? is null or club_id = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toAiRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listNotificationReplayPreviews(filter: AdminAuditFilter, pageRequest: PageRequest): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, actor_user_id, cast(filter_json as char) as filter_json, selection_hash,
                   matched_count, expires_at, consumed_at, created_at
            from admin_notification_replay_previews
            where created_at >= ? and created_at < ?
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toReplayPreviewRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            pageRequest.limit,
        )

    private fun ResultSet.toPlatformRow(): AdminAuditSourceRow =
        AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.PLATFORM,
            sourceId = getString("id"),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("actor_user_id"),
            actorRole = getString("actor_platform_role"),
            clubId = null,
            targetUserId = uuidOrNull("target_user_id"),
            actionType = getString("event_type"),
            outcomeHint = null,
            metadataJson = getString("metadata_json"),
        )

    private fun ResultSet.toClubRow(): AdminAuditSourceRow =
        AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.CLUB,
            sourceId = getString("id"),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("actor_user_id"),
            actorRole = getString("actor_platform_role"),
            clubId = uuidOrNull("club_id"),
            targetUserId = null,
            actionType = getString("event_type"),
            outcomeHint = null,
            metadataJson = getString("metadata_json"),
        )
}
```

Complete `toAiRow`, `toReplayPreviewRow`, `uuidOrNull`, and `toSqlTimestamp` in the same file:

```kotlin
private fun ResultSet.toAiRow(): AdminAuditSourceRow {
    val jobId = getString("job_id")
    val metadataJson =
        """
        {"jobId":"$jobId","provider":"${getString("provider")}","model":"${getString("model")}","status":"${getString("status")}","errorCode":${getString("error_code")?.quoteJson()},"inputTokens":${getInt("input_tokens")},"cachedInputTokens":${getInt("cached_input_tokens")},"outputTokens":${getInt("output_tokens")},"costEstimateUsd":"${getBigDecimal("cost_estimate_usd")}","latencyMs":${getInt("latency_ms")}}
        """.trimIndent()
    return AdminAuditSourceRow(
        sourceType = AdminAuditSourceType.AI_GENERATION,
        sourceId = getLong("id").toString(),
        occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
        actorUserId = uuidOrNull("host_user_id"),
        actorRole = "HOST",
        clubId = uuidOrNull("club_id"),
        targetUserId = null,
        actionType = "AI_GENERATION_AUDIT",
        outcomeHint = getString("status"),
        metadataJson = metadataJson,
    )
}

private fun ResultSet.toReplayPreviewRow(): AdminAuditSourceRow {
    val selectionHash = getString("selection_hash")
    val metadataJson =
        """
        {"matchedCount":${getInt("matched_count")},"selectionHash":"$selectionHash","expiresAt":"${getTimestamp("expires_at").toInstant().atOffset(ZoneOffset.UTC)}","consumedAt":${getTimestamp("consumed_at")?.toInstant()?.atOffset(ZoneOffset.UTC)?.toString()?.quoteJson()},"filter":${getString("filter_json")}}
        """.trimIndent()
    return AdminAuditSourceRow(
        sourceType = AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW,
        sourceId = getString("id"),
        occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
        actorUserId = uuidOrNull("actor_user_id"),
        actorRole = "OWNER",
        clubId = null,
        targetUserId = null,
        actionType = "ADMIN_NOTIFICATION_REPLAY_PREVIEW",
        outcomeHint = "PREPARED",
        metadataJson = metadataJson,
    )
}

private fun ResultSet.uuidOrNull(column: String): UUID? = getString(column)?.let { UUID.fromString(it) }
private fun OffsetDateTime.toSqlTimestamp(): java.sql.Timestamp = java.sql.Timestamp.from(toInstant())
private fun String.quoteJson(): String = "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""
```

If ktlint rejects the string formatting, replace the inline JSON construction with a small `ObjectMapper` dependency in the adapter. Keep the output keys exactly the same.

- [ ] **Step 4: Add the controller and error handler**

Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/PlatformAdminAuditController.kt`.

```kotlin
@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.audit.adapter.`in`.web

import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditActorRole
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditLedgerItem
import com.readmates.admin.audit.application.model.AdminAuditLedgerPage
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditOutcome
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditTimeRange
import com.readmates.admin.audit.application.port.`in`.ListAdminAuditLedgerUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@RestController
@RequestMapping("/api/admin/audit")
class PlatformAdminAuditController(
    private val useCase: ListAdminAuditLedgerUseCase,
) {
    @GetMapping("/events")
    fun events(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) from: OffsetDateTime?,
        @RequestParam(required = false) to: OffsetDateTime?,
        @RequestParam(required = false) range: String?,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) actorRole: AdminAuditActorRole?,
        @RequestParam(required = false) sourceSlice: AdminAuditSourceSlice?,
        @RequestParam(required = false) actionCategory: AdminAuditActionCategory?,
        @RequestParam(required = false) outcome: AdminAuditOutcome?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): AdminAuditLedgerPageResponse {
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val normalizedRange = range?.toTimeRange()
        val resolvedTo = (to ?: now).withOffsetSameInstant(ZoneOffset.UTC)
        val resolvedFrom =
            (from ?: normalizedRange?.from(resolvedTo) ?: resolvedTo.minusDays(7))
                .withOffsetSameInstant(ZoneOffset.UTC)
        return useCase
            .listLedger(
                admin,
                AdminAuditListQuery(
                    filter =
                        AdminAuditFilter(
                            from = resolvedFrom,
                            to = resolvedTo,
                            range = normalizedRange,
                            clubId = clubId,
                            actorRole = actorRole,
                            sourceSlice = sourceSlice,
                            actionCategory = actionCategory,
                            outcome = outcome,
                        ),
                    pageRequest = PageRequest.cursor(limit, cursor, defaultLimit = 25, maxLimit = 50),
                ),
            ).toResponse()
    }
}
```

Add response DTOs below the controller in the same file. Keep wire names camelCase.

```kotlin
data class AdminAuditLedgerPageResponse(
    val generatedAt: OffsetDateTime,
    val filters: Any,
    val summary: Any,
    val items: List<AdminAuditLedgerItem>,
    val nextCursor: String?,
)

private fun AdminAuditLedgerPage.toResponse(): AdminAuditLedgerPageResponse =
    AdminAuditLedgerPageResponse(
        generatedAt = generatedAt,
        filters = filters,
        summary = summary,
        items = items,
        nextCursor = nextCursor,
    )

private fun String.toTimeRange(): AdminAuditTimeRange =
    AdminAuditTimeRange.entries.firstOrNull { it.wireValue == this } ?: AdminAuditTimeRange.DAYS_7

private fun AdminAuditTimeRange.from(to: OffsetDateTime): OffsetDateTime =
    when (this) {
        AdminAuditTimeRange.HOURS_24 -> to.minusHours(24)
        AdminAuditTimeRange.DAYS_7 -> to.minusDays(7)
        AdminAuditTimeRange.DAYS_30 -> to.minusDays(30)
        AdminAuditTimeRange.DAYS_90 -> to.minusDays(90)
    }
```

Create `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/AdminAuditErrorHandler.kt`.

```kotlin
@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.audit.adapter.`in`.web

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [PlatformAdminAuditController::class])
class AdminAuditErrorHandler {
    @ExceptionHandler(AdminAuditException::class)
    fun handleAdminAuditException(exception: AdminAuditException): ResponseEntity<Void> =
        ResponseEntity.status(exception.error.toHttpStatus()).build()

    private fun AdminAuditError.toHttpStatus(): HttpStatus =
        when (this) {
            AdminAuditError.INVALID_FILTER -> HttpStatus.BAD_REQUEST
            AdminAuditError.INVALID_CURSOR -> HttpStatus.BAD_REQUEST
        }
}
```

- [ ] **Step 5: Complete integration test seed helpers**

Add these helpers to `PlatformAdminAuditControllerTest.kt`. Use existing dev seed UUIDs already present in admin tests.

```kotlin
private fun seedAuditRows() {
    jdbcTemplate.update(
        """
        insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
        values (?, ?, 'OWNER', ?, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED',
                json_object('previewId', ?, 'selectionHash', ?, 'reason', 'provider recovered', 'replayedCount', 2, 'skippedCount', 0),
                utc_timestamp(6))
        """.trimIndent(),
        PLATFORM_EVENT_ID,
        OWNER_USER_ID,
        MEMBER_USER_ID,
        PREVIEW_ID,
        "a".repeat(64),
    )
    jdbcTemplate.update(
        """
        insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
        values (?, ?, 'OWNER', ?, 'SUPPORT_ACCESS_GRANT_CREATED',
                json_object('grantId', 'grant-1', 'clubId', ?, 'granteeUserId', ?, 'scope', 'METADATA_READ', 'expiresAt', '2026-05-28T00:00:00Z'),
                utc_timestamp(6))
        """.trimIndent(),
        SUPPORT_EVENT_ID,
        OWNER_USER_ID,
        MEMBER_USER_ID,
        CLUB_ID,
        MEMBER_USER_ID,
    )
    jdbcTemplate.update(
        """
        insert into club_audit_events (id, actor_user_id, actor_platform_role, club_id, event_type, metadata_json, created_at)
        values (?, ?, 'OPERATOR', ?, 'CLUB_STATUS_CHANGED', json_object('reason', 'manual review'), utc_timestamp(6))
        """.trimIndent(),
        CLUB_EVENT_ID,
        OWNER_USER_ID,
        CLUB_ID,
    )
    jdbcTemplate.update(
        """
        insert into ai_generation_audit_log (
          job_id, session_id, club_id, host_user_id, kind, provider, model, status, error_code,
          input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
        )
        values (?, ?, ?, ?, 'GENERATE', 'openai', 'gpt-safe', 'FAILED', 'PROVIDER_UNAVAILABLE',
                10, 0, 3, 0.0100, 1200, utc_timestamp(6))
        """.trimIndent(),
        AI_JOB_ID,
        SESSION_ID,
        CLUB_ID,
        MEMBER_USER_ID,
    )
    jdbcTemplate.update(
        """
        insert into admin_notification_replay_previews (id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, consumed_at, created_at)
        values (?, ?, json_object('deliveryStatus', 'DEAD'), ?, 2, timestampadd(MINUTE, 10, utc_timestamp(6)), null, utc_timestamp(6))
        """.trimIndent(),
        PREVIEW_ID,
        OWNER_USER_ID,
        "a".repeat(64),
    )
}

private fun sessionCookieForUser(userId: String): Cookie {
    val issuedSession =
        authSessionService.issueSession(
            userId = UUID.fromString(userId).toString(),
            userAgent = "PlatformAdminAuditControllerTest",
            ipAddress = "127.0.0.1",
        )
    createdSessionTokenHashes += issuedSession.storedTokenHash
    return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
}

private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000000202"
private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
private const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
private const val PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008101"
private const val SUPPORT_EVENT_ID = "00000000-0000-0000-0000-000000008102"
private const val CLUB_EVENT_ID = "00000000-0000-0000-0000-000000008201"
private const val PREVIEW_ID = "00000000-0000-0000-0000-000000008301"
private const val AI_JOB_ID = "00000000-0000-0000-0000-000000008401"
```

- [ ] **Step 6: Run backend checks for Tasks 1 and 2**

Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest"
./server/gradlew -p server integrationTest --tests "com.readmates.admin.audit.api.PlatformAdminAuditControllerTest"
./server/gradlew -p server architectureTest
```

Expected: all pass. If `architectureTest` flags the new read-side package, add the package to the read-only package allowlist in `ServerArchitectureBoundaryTest` and keep the service annotated with `@ReadOnlyApplicationService`.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/src/main/kotlin/com/readmates/admin/audit server/src/test/kotlin/com/readmates/admin/audit server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat: expose admin audit ledger API"
```

---

## Task 3: Frontend API, Model, Query, And Loader

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-audit-model.ts`
- Create: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`
- Create: `front/features/platform-admin/api/platform-admin-audit-api.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Create: `front/features/platform-admin/queries/platform-admin-audit-queries.ts`
- Create: `front/features/platform-admin/route/admin-audit-data.ts`

- [ ] **Step 1: Write model tests for URL/filter normalization and safe labels**

Create `front/features/platform-admin/model/platform-admin-audit-model.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  labelAdminAuditOutcome,
  shouldShowAdminAuditDetailValue,
} from "./platform-admin-audit-model";

describe("platform-admin-audit-model", () => {
  it("defaults to 7d range and drops unknown enum values", () => {
    const filters = adminAuditFiltersFromSearchParams(new URLSearchParams("range=invalid&sourceSlice=S5&outcome=FAILED"));

    expect(filters).toEqual({
      range: "7d",
      sourceSlice: "S5",
      outcome: "FAILED",
    });
  });

  it("serializes only meaningful filter values", () => {
    const search = adminAuditSearchFromFilters({ range: "30d", clubId: "club-1", actorRole: null, sourceSlice: "S4" });

    expect(search.toString()).toBe("range=30d&clubId=club-1&sourceSlice=S4");
  });

  it("labels outcomes for ledger chips", () => {
    expect(labelAdminAuditOutcome("SUCCESS")).toBe("성공");
    expect(labelAdminAuditOutcome("PREPARED")).toBe("준비됨");
  });

  it("suppresses unsafe metadata values in defensive UI helpers", () => {
    expect(shouldShowAdminAuditDetailValue("rawJson", "{\"secret\":\"value\"}")).toBe(false);
    expect(shouldShowAdminAuditDetailValue("scope", "METADATA_READ")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing model test**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-audit-model.test.ts
```

Expected: fail because the model module does not exist.

- [ ] **Step 3: Add audit model types and helpers**

Create `front/features/platform-admin/model/platform-admin-audit-model.ts`.

```ts
export type AdminAuditRange = "24h" | "7d" | "30d" | "90d";
export type AdminAuditSourceSlice = "S3" | "S4" | "S5" | "S6" | "PLATFORM" | "CLUB";
export type AdminAuditActionCategory = "NOTIFICATION" | "SUPPORT" | "CLUB_LIFECYCLE" | "AI_OPS" | "AUTH_SECURITY" | "PLATFORM_ADMIN";
export type AdminAuditActorRole = "OWNER" | "OPERATOR" | "SUPPORT" | "HOST" | "MEMBER" | "SYSTEM" | "UNKNOWN";
export type AdminAuditOutcome = "SUCCESS" | "FAILED" | "DENIED" | "PREPARED" | "UNKNOWN";
export type AdminAuditMetadataState = "AVAILABLE" | "EMPTY" | "UNAVAILABLE";

export type AdminAuditFilters = {
  range?: AdminAuditRange;
  from?: string | null;
  to?: string | null;
  clubId?: string | null;
  actorRole?: AdminAuditActorRole | null;
  sourceSlice?: AdminAuditSourceSlice | null;
  actionCategory?: AdminAuditActionCategory | null;
  outcome?: AdminAuditOutcome | null;
  cursor?: string | null;
};

export type AdminAuditLedgerPage = {
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: {
    visibleCount: number;
    sourceUnavailableCount: number;
    metadataUnavailableCount: number;
    unavailableSources: string[];
  };
  items: AdminAuditLedgerItem[];
  nextCursor: string | null;
};

export type AdminAuditLedgerItem = {
  id: string;
  occurredAt: string;
  sourceSlice: AdminAuditSourceSlice;
  sourceTable: string;
  actionCategory: AdminAuditActionCategory;
  actionType: string;
  outcome: AdminAuditOutcome;
  actor: { userId: string | null; role: AdminAuditActorRole; displayLabel: string };
  target: { clubId: string | null; userId: string | null; jobId: string | null; eventId: string | null; label: string };
  summary: string;
  safeMetadata: Array<{ label: string; value: string; kind: string }>;
  metadataState: AdminAuditMetadataState;
};

const RANGES: AdminAuditRange[] = ["24h", "7d", "30d", "90d"];
const SOURCE_SLICES: AdminAuditSourceSlice[] = ["S3", "S4", "S5", "S6", "PLATFORM", "CLUB"];
const ACTOR_ROLES: AdminAuditActorRole[] = ["OWNER", "OPERATOR", "SUPPORT", "HOST", "MEMBER", "SYSTEM", "UNKNOWN"];
const ACTION_CATEGORIES: AdminAuditActionCategory[] = ["NOTIFICATION", "SUPPORT", "CLUB_LIFECYCLE", "AI_OPS", "AUTH_SECURITY", "PLATFORM_ADMIN"];
const OUTCOMES: AdminAuditOutcome[] = ["SUCCESS", "FAILED", "DENIED", "PREPARED", "UNKNOWN"];

export function adminAuditFiltersFromSearchParams(params: URLSearchParams): AdminAuditFilters {
  return {
    range: enumParam(params.get("range"), RANGES) ?? "7d",
    from: params.get("from"),
    to: params.get("to"),
    clubId: params.get("clubId"),
    actorRole: enumParam(params.get("actorRole"), ACTOR_ROLES),
    sourceSlice: enumParam(params.get("sourceSlice"), SOURCE_SLICES),
    actionCategory: enumParam(params.get("actionCategory"), ACTION_CATEGORIES),
    outcome: enumParam(params.get("outcome"), OUTCOMES),
    cursor: params.get("cursor"),
  };
}

export function adminAuditSearchFromFilters(filters: AdminAuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  setParam(params, "range", filters.range);
  setParam(params, "from", filters.from);
  setParam(params, "to", filters.to);
  setParam(params, "clubId", filters.clubId);
  setParam(params, "actorRole", filters.actorRole);
  setParam(params, "sourceSlice", filters.sourceSlice);
  setParam(params, "actionCategory", filters.actionCategory);
  setParam(params, "outcome", filters.outcome);
  setParam(params, "cursor", filters.cursor);
  return params;
}

export function labelAdminAuditOutcome(outcome: AdminAuditOutcome): string {
  return {
    SUCCESS: "성공",
    FAILED: "실패",
    DENIED: "거부",
    PREPARED: "준비됨",
    UNKNOWN: "알 수 없음",
  }[outcome];
}

export function shouldShowAdminAuditDetailValue(label: string, value: string): boolean {
  if (label.toLowerCase().includes("raw")) return false;
  if (value.includes("{") || value.includes("}")) return false;
  return true;
}

function enumParam<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? (value as T) : null;
}

function setParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) params.set(key, value);
}
```

- [ ] **Step 4: Add API and Query modules**

Create `front/features/platform-admin/api/platform-admin-audit-api.ts`.

```ts
import { readmatesFetch } from "@/shared/api/client";
import type { AdminAuditFilters, AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";

export function fetchAdminAuditLedger(filters: AdminAuditFilters = {}) {
  return readmatesFetch<AdminAuditLedgerPage>(
    `/api/admin/audit/events${adminAuditSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

function adminAuditSearch(filters: AdminAuditFilters): string {
  const params = new URLSearchParams();
  if (filters.range) params.set("range", filters.range);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.actorRole) params.set("actorRole", filters.actorRole);
  if (filters.sourceSlice) params.set("sourceSlice", filters.sourceSlice);
  if (filters.actionCategory) params.set("actionCategory", filters.actionCategory);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const search = params.toString();
  return search ? `?${search}` : "";
}
```

Create `front/features/platform-admin/queries/platform-admin-audit-queries.ts`.

```ts
import { queryOptions } from "@tanstack/react-query";
import { fetchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import type { AdminAuditFilters } from "@/features/platform-admin/model/platform-admin-audit-model";

function normalizeFilters(filters: AdminAuditFilters = {}) {
  return {
    range: filters.range ?? "7d",
    from: filters.from ?? null,
    to: filters.to ?? null,
    clubId: filters.clubId ?? null,
    actorRole: filters.actorRole ?? null,
    sourceSlice: filters.sourceSlice ?? null,
    actionCategory: filters.actionCategory ?? null,
    outcome: filters.outcome ?? null,
    cursor: filters.cursor ?? null,
  };
}

export const platformAdminAuditKeys = {
  all: ["platform-admin", "audit"] as const,
  ledger: (filters?: AdminAuditFilters) => [...platformAdminAuditKeys.all, "ledger", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAuditLedgerQuery(filters?: AdminAuditFilters) {
  return queryOptions({
    queryKey: platformAdminAuditKeys.ledger(filters),
    queryFn: () => fetchAdminAuditLedger(filters),
  });
}
```

Modify `front/features/platform-admin/api/platform-admin-contracts.ts`:

```ts
export type {
  AdminAuditFilters,
  AdminAuditLedgerItem,
  AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";
```

- [ ] **Step 5: Add loader factory and run frontend model/query tests**

Create `front/features/platform-admin/route/admin-audit-data.ts`.

```ts
import type { QueryClient } from "@tanstack/react-query";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";

export function adminAuditLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAudit() {
    await queryClient.fetchQuery(platformAdminAuditLedgerQuery({ range: "7d" }));
    return null;
  };
}
```

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-audit-model.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/platform-admin/model/platform-admin-audit-model.ts front/features/platform-admin/model/platform-admin-audit-model.test.ts front/features/platform-admin/api/platform-admin-audit-api.ts front/features/platform-admin/api/platform-admin-contracts.ts front/features/platform-admin/queries/platform-admin-audit-queries.ts front/features/platform-admin/route/admin-audit-data.ts
git commit -m "feat: add admin audit frontend data layer"
```

---

## Task 4: Frontend Route, UI, Styling, And E2E

**Files:**
- Create: `front/features/platform-admin/route/admin-audit-route.tsx`
- Create: `front/features/platform-admin/route/admin-audit-route.test.tsx`
- Create: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Create: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Modify: `front/src/app/routes/admin.tsx`
- Modify: `front/src/styles/globals.css`
- Create: `front/tests/e2e/admin-audit.spec.ts`
- Modify: `front/tests/e2e/admin-shell.spec.ts`

- [ ] **Step 1: Write UI and route tests**

Create `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`.

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminAuditLedger } from "./admin-audit-ledger";
import type { AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";

const page: AdminAuditLedgerPage = {
  generatedAt: "2026-05-27T00:00:00Z",
  filters: {},
  summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
  nextCursor: "cursor-1",
  items: [
    {
      id: "platform_audit_events:event-1",
      occurredAt: "2026-05-27T00:01:00Z",
      sourceSlice: "S5",
      sourceTable: "platform_audit_events",
      actionCategory: "NOTIFICATION",
      actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
      outcome: "SUCCESS",
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리가 확정되었습니다.",
      safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
      metadataState: "AVAILABLE",
    },
    {
      id: "platform_audit_events:event-2",
      occurredAt: "2026-05-27T00:00:00Z",
      sourceSlice: "S4",
      sourceTable: "platform_audit_events",
      actionCategory: "SUPPORT",
      actionType: "SUPPORT_ACCESS_GRANT_CREATED",
      outcome: "SUCCESS",
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
      summary: "support grant가 생성되었습니다.",
      safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
      metadataState: "AVAILABLE",
    },
  ],
};

describe("AdminAuditLedger", () => {
  it("renders ledger rows and safe metadata detail", async () => {
    const user = userEvent.setup();
    render(<AdminAuditLedger page={page} filters={{ range: "7d" }} loading={false} error={null} onFilterChange={vi.fn()} onLoadMore={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "감사" })).toBeInTheDocument();
    expect(screen.getByText("알림 재처리가 확정되었습니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /알림 재처리가 확정되었습니다/ }));

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("selectionHashPrefix")).toBeInTheDocument();
    expect(detail.textContent).not.toContain("{");
  });

  it("shows partial source unavailable state", () => {
    render(
      <AdminAuditLedger
        page={{ ...page, summary: { ...page.summary, sourceUnavailableCount: 1, unavailableSources: ["AI_GENERATION"] } }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("일부 감사 source를 불러오지 못했습니다.");
  });
});
```

Create `front/features/platform-admin/route/admin-audit-route.test.tsx`.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import { AdminAuditRoute } from "./admin-audit-route";

function renderRoute(initialEntry = "/admin/audit?sourceSlice=S5") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminAuditLedgerQuery({ range: "7d", sourceSlice: "S5" }).queryKey, {
    generatedAt: "2026-05-27T00:00:00Z",
    filters: {},
    summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
    nextCursor: null,
    items: [
      {
        id: "platform_audit_events:event-1",
        occurredAt: "2026-05-27T00:01:00Z",
        sourceSlice: "S5",
        sourceTable: "platform_audit_events",
        actionCategory: "NOTIFICATION",
        actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
        outcome: "SUCCESS",
        actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
        target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
        summary: "알림 재처리가 확정되었습니다.",
        safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
        metadataState: "AVAILABLE",
      },
    ],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAuditRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAuditRoute", () => {
  it("renders cached audit ledger rows from URL filters", () => {
    renderRoute();

    expect(screen.getByRole("heading", { name: "감사" })).toBeInTheDocument();
    expect(screen.getByText("알림 재처리가 확정되었습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing route/UI tests**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx
```

Expected: fail because the route and UI modules do not exist.

- [ ] **Step 3: Add UI component**

Create `front/features/platform-admin/ui/admin-audit-ledger.tsx`.

```tsx
import { useState } from "react";
import type { AdminAuditFilters, AdminAuditLedgerItem, AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { labelAdminAuditOutcome, shouldShowAdminAuditDetailValue } from "@/features/platform-admin/model/platform-admin-audit-model";

export type AdminAuditLedgerProps = {
  page: AdminAuditLedgerPage | null;
  filters: AdminAuditFilters;
  loading: boolean;
  error: string | null;
  onFilterChange: (filters: AdminAuditFilters) => void;
  onLoadMore: () => void;
};

export function AdminAuditLedger({ page, filters, loading, error, onFilterChange, onLoadMore }: AdminAuditLedgerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(page?.items[0]?.id ?? null);
  const selected = page?.items.find((item) => item.id === selectedId) ?? page?.items[0] ?? null;

  return (
    <section className="admin-audit" aria-labelledby="admin-audit-title">
      <header className="admin-audit__header">
        <div>
          <p className="eyebrow">S7 Review</p>
          <h1 id="admin-audit-title" className="h1 editorial">감사</h1>
        </div>
        <p className="admin-audit__timestamp">범위 {filters.range ?? "7d"} · {page?.summary.visibleCount ?? 0}건</p>
      </header>

      <div className="admin-audit__filters" aria-label="감사 필터">
        {(["24h", "7d", "30d", "90d"] as const).map((range) => (
          <button key={range} type="button" className={filters.range === range ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"} onClick={() => onFilterChange({ ...filters, range, cursor: null })}>
            {range}
          </button>
        ))}
      </div>

      {error ? <p className="admin-audit__error" role="alert">{error}</p> : null}
      {page && page.summary.sourceUnavailableCount > 0 ? (
        <p className="admin-audit__partial" role="status">일부 감사 source를 불러오지 못했습니다. {page.summary.unavailableSources.join(", ")}</p>
      ) : null}
      {loading ? <p className="admin-audit__loading">감사 ledger를 불러오는 중입니다.</p> : null}

      <div className="admin-audit__body">
        <div className="admin-audit__rows" aria-label="감사 이벤트 목록">
          {page && page.items.length > 0 ? (
            page.items.map((item) => (
              <button key={item.id} type="button" className="admin-audit__row" onClick={() => setSelectedId(item.id)}>
                <span className="admin-audit__row-time">{formatTimestamp(item.occurredAt)}</span>
                <span className="admin-audit__row-main">{item.summary}</span>
                <span className="platform-admin-domain-status">{labelAdminAuditOutcome(item.outcome)}</span>
                <span className="admin-audit__slice">{item.sourceSlice}</span>
              </button>
            ))
          ) : (
            <p className="muted">선택한 조건에 해당하는 감사 이벤트가 없습니다.</p>
          )}
          {page?.nextCursor ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onLoadMore}>더 보기</button>
          ) : null}
        </div>
        <AuditDetail item={selected} />
      </div>
    </section>
  );
}

function AuditDetail({ item }: { item: AdminAuditLedgerItem | null }) {
  if (!item) {
    return <aside className="admin-audit__detail" aria-label="감사 이벤트 상세"><p className="muted">이벤트를 선택하세요.</p></aside>;
  }
  return (
    <aside className="admin-audit__detail" aria-label="감사 이벤트 상세">
      <h2 className="h3 editorial">{item.summary}</h2>
      <p className="tiny muted">{item.sourceTable} · {item.actionType}</p>
      <dl className="admin-audit__metadata">
        {item.safeMetadata.filter((entry) => shouldShowAdminAuditDetailValue(entry.label, entry.value)).map((entry) => (
          <div key={`${entry.label}-${entry.value}`}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
      {item.metadataState === "UNAVAILABLE" ? <p className="muted">세부 정보를 안전하게 표시할 수 없습니다.</p> : null}
      {item.metadataState === "EMPTY" ? <p className="muted">세부 정보 숨김</p> : null}
    </aside>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
```

- [ ] **Step 4: Add route module and route wiring**

Create `front/features/platform-admin/route/admin-audit-route.tsx`.

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  type AdminAuditFilters,
} from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import { AdminAuditLedger } from "@/features/platform-admin/ui/admin-audit-ledger";

const GENERIC_ERROR = "감사 ledger를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminAuditRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => adminAuditFiltersFromSearchParams(searchParams), [searchParams]);
  const [cursor, setCursor] = useState<string | null>(filters.cursor ?? null);
  const query = useQuery(platformAdminAuditLedgerQuery({ ...filters, cursor }));

  function changeFilters(next: AdminAuditFilters) {
    setCursor(null);
    setSearchParams(adminAuditSearchFromFilters({ ...next, cursor: null }));
  }

  function loadMore() {
    if (query.data?.nextCursor) setCursor(query.data.nextCursor);
  }

  return (
    <AdminAuditLedger
      page={query.data ?? null}
      filters={filters}
      loading={query.isLoading}
      error={query.isError ? GENERIC_ERROR : null}
      onFilterChange={changeFilters}
      onLoadMore={loadMore}
    />
  );
}
```

Modify `front/src/app/routes/admin.tsx` ready switch:

```tsx
    case "audit":
      return {
        path: "audit",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminAuditRoute }, { adminAuditLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-audit-route"),
            import("@/features/platform-admin/route/admin-audit-data"),
          ]);
          return { Component: AdminAuditRoute, loader: adminAuditLoaderFactory(queryClient) };
        },
      };
```

Modify `front/features/platform-admin/model/admin-route-catalog.ts` so `audit` is ready:

```ts
  {
    path: "audit",
    label: "감사",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S7",
    status: "ready",
    requiredCapability: "view_audit",
  },
```

Update `admin-route-catalog.test.ts` ready-route expectation to include `"audit"` and keep `"analytics"` as the only coming-soon review route.

- [ ] **Step 5: Add CSS**

Append focused styles to `front/src/styles/globals.css`.

```css
.admin-audit {
  display: grid;
  gap: 1rem;
}

.admin-audit__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.admin-audit__timestamp,
.admin-audit__slice {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.admin-audit__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-audit__partial,
.admin-audit__error,
.admin-audit__loading {
  margin: 0;
}

.admin-audit__partial {
  color: var(--color-ink);
}

.admin-audit__error {
  color: var(--color-danger, #9b1c1c);
}

.admin-audit__body {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.8fr);
  gap: 1rem;
  align-items: start;
}

.admin-audit__rows,
.admin-audit__detail {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
}

.admin-audit__rows {
  display: grid;
}

.admin-audit__row {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr) auto auto;
  gap: 0.75rem;
  align-items: center;
  width: 100%;
  padding: 0.875rem 1rem;
  border: 0;
  border-bottom: 1px solid var(--color-line);
  background: transparent;
  color: inherit;
  text-align: left;
}

.admin-audit__row:hover,
.admin-audit__row:focus-visible {
  background: var(--color-paper);
}

.admin-audit__row-main {
  min-width: 0;
}

.admin-audit__detail {
  padding: 1rem;
  position: sticky;
  top: 1rem;
}

.admin-audit__metadata {
  display: grid;
  gap: 0.625rem;
}

.admin-audit__metadata div {
  display: grid;
  grid-template-columns: minmax(7rem, 0.4fr) minmax(0, 1fr);
  gap: 0.75rem;
}

.admin-audit__metadata dt {
  color: var(--color-muted);
}

.admin-audit__metadata dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .admin-audit__header,
  .admin-audit__body {
    grid-template-columns: 1fr;
  }

  .admin-audit__header {
    display: grid;
  }

  .admin-audit__row {
    grid-template-columns: 1fr;
  }

  .admin-audit__detail {
    position: static;
  }
}
```

If exact CSS variables differ, use existing nearby admin variables from `globals.css`; keep the class names and responsive structure.

- [ ] **Step 6: Add Playwright E2E and update shell E2E**

Create `front/tests/e2e/admin-audit.spec.ts`.

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routePlatformAdminShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

async function routeAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      filters: { range: "7d" },
      summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [
        {
          id: "platform_audit_events:event-1",
          occurredAt: "2026-05-27T00:01:00Z",
          sourceSlice: "S5",
          sourceTable: "platform_audit_events",
          actionCategory: "NOTIFICATION",
          actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
          summary: "알림 재처리가 확정되었습니다.",
          safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
          metadataState: "AVAILABLE",
        },
        {
          id: "platform_audit_events:event-2",
          occurredAt: "2026-05-27T00:00:00Z",
          sourceSlice: "S4",
          sourceTable: "platform_audit_events",
          actionCategory: "SUPPORT",
          actionType: "SUPPORT_ACCESS_GRANT_CREATED",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
          summary: "support grant가 생성되었습니다.",
          safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
          metadataState: "AVAILABLE",
        },
      ],
    });
  });
}

test("owner reviews admin audit ledger without raw private fields", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);

  await page.goto("/admin/audit");

  await expect(page.getByRole("heading", { name: "감사" })).toBeVisible();
  await expect(page.getByText("알림 재처리가 확정되었습니다.")).toBeVisible();
  await expect(page.getByText("support grant가 생성되었습니다.")).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
```

Modify `front/tests/e2e/admin-shell.spec.ts` by replacing the coming-soon audit test with an analytics coming-soon test:

```ts
test("analytics coming-soon route renders the slice descriptor", async ({ page }) => {
  await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
  await page.goto("/admin/analytics");
  await expect(page.getByLabel("분석/리포팅 lite").getByText(/준비 중 · S8/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "분석/리포팅 lite" })).toBeVisible();
});
```

- [ ] **Step 7: Run frontend targeted checks**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-audit-model.test.ts features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx
pnpm --dir front exec playwright test tests/e2e/admin-audit.spec.ts tests/e2e/admin-shell.spec.ts --project=chromium
```

Expected: pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add front/features/platform-admin/model front/features/platform-admin/api front/features/platform-admin/queries front/features/platform-admin/route front/features/platform-admin/ui front/src/app/routes/admin.tsx front/src/styles/globals.css front/tests/e2e/admin-audit.spec.ts front/tests/e2e/admin-shell.spec.ts
git commit -m "feat: ship admin audit ledger route"
```

---

## Task 5: Metadata Hardening, Docs, And Verification Closeout

**Files:**
- Modify as needed: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Modify as needed: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Modify: `CHANGELOG.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/server-state-migration.md`
- Modify tests touched by metadata changes.

- [ ] **Step 1: Add metadata regression tests only if Task 2 reveals weak source rows**

Inspect the JSON produced by `/api/admin/audit/events` in `PlatformAdminAuditControllerTest`. If S5/S4 rows already project useful `safeMetadata`, skip production metadata write changes and keep this task docs-only. If projection lacks required fields, add regression assertions first.

For S5 replay, extend `AdminNotificationOperationsServiceTest` with:

```kotlin
assertThat(event.metadataJson).contains("\"previewId\":\"$PREVIEW_ID\"")
assertThat(event.metadataJson).contains("\"selectionHash\":\"$SELECTION_HASH\"")
assertThat(event.metadataJson).contains("\"reason\":\"Retry failed deliveries\"")
assertThat(event.metadataJson).contains("\"replayedCount\":2")
assertThat(event.metadataJson).contains("\"skippedCount\":1")
```

For S4 support grant, extend `SupportAccessGrantServiceTest` with:

```kotlin
assertThat(audit.metadataJson).contains("\"grantId\"")
assertThat(audit.metadataJson).contains("\"clubId\"")
assertThat(audit.metadataJson).contains("\"granteeUserId\"")
assertThat(audit.metadataJson).contains("\"scope\":\"METADATA_READ\"")
assertThat(audit.metadataJson).contains("\"expiresAt\"")
```

Run the targeted tests:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest" --tests "com.readmates.club.application.service.SupportAccessGrantServiceTest"
```

Expected: pass before and after any additive metadata tweaks.

- [ ] **Step 2: Update architecture docs after behavior ships**

Modify `docs/development/architecture.md` platform-admin row to include `/admin/audit` and add a short paragraph near the existing platform-admin notification section:

```markdown
Platform admin 감사 ledger는 `/api/admin/audit/events`와 `/admin/audit`에서 기존 `platform_audit_events`, `club_audit_events`, `ai_generation_audit_log`, `admin_notification_replay_previews`를 읽기 전용 cursor ledger로 통합합니다. Source별 allowlist projection만 응답하며 raw metadata JSON, provider raw error, email body, transcript, generated result JSON은 노출하지 않습니다. S8 analytics와 호환되도록 date range, club scope, source slice, action category, actor role, outcome 필터 이름을 고정합니다.
```

Modify `docs/development/server-state-migration.md` by adding:

```markdown
11. `platform-admin/audit` — 통합 감사 ledger를 loader-seeded Query read model로 분리합니다. Filter URL state는 S8 analytics가 재사용할 date range, club scope, source slice, action category, actor role, outcome vocabulary를 따릅니다.
```

Move it to the completed list:

```markdown
- `platform-admin/audit` — platform/club/notification replay/AI audit source를 Query-owned cursor ledger로 조회하고, route loader seeding과 safe metadata detail rendering을 적용합니다.
```

- [ ] **Step 3: Update CHANGELOG**

Under `## Unreleased`, add one Engineering bullet near existing platform-admin bullets:

```markdown
- **platform-admin:** ship `/admin/audit` as a read-only operating ledger over platform, club, notification replay, and AI audit sources. The route uses safe metadata projection, role-aware masking, cursor pagination, and S8-compatible filter vocabulary without exposing raw provider errors, email bodies, transcripts, or generated result JSON.
```

- [ ] **Step 4: Run integrated verification**

Run the smallest full surface that can regress:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server unitTest --tests "com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest" --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest" --tests "com.readmates.club.application.service.SupportAccessGrantServiceTest"
./server/gradlew -p server integrationTest --tests "com.readmates.admin.audit.api.PlatformAdminAuditControllerTest"
./server/gradlew -p server architectureTest
git diff --check
```

Run E2E because this changes a routed admin user flow:

```bash
pnpm --dir front exec playwright test tests/e2e/admin-audit.spec.ts tests/e2e/admin-shell.spec.ts --project=chromium
```

For public safety, run a targeted scan over changed docs, frontend fixtures, and backend tests:

```bash
rg -n 'member1@example.com|SMTP 550|transcript body|generated result|sk-[A-Za-z0-9]|ocid1\\.|/Users/' CHANGELOG.md docs/development/architecture.md docs/development/server-state-migration.md front/tests/e2e/admin-audit.spec.ts server/src/test/kotlin/com/readmates/admin/audit
```

Expected: no matches except intentional negative assertions in tests. If negative assertions match, confirm they appear only inside `doesNotContain`, `toHaveCount(0)`, or seeded unsafe strings used to prove redaction.

- [ ] **Step 5: Refresh Graphify after code changes**

Run:

```bash
graphify update .
```

Expected: graph refresh completes. Do not commit `graphify-out/` raw output if it remains ignored.

- [ ] **Step 6: Commit Task 5**

```bash
git add CHANGELOG.md docs/development/architecture.md docs/development/server-state-migration.md server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt
git commit -m "docs: document admin audit ledger release"
```

If no production metadata hardening files changed, stage only the docs and any verification-related test updates:

```bash
git add CHANGELOG.md docs/development/architecture.md docs/development/server-state-migration.md
git commit -m "docs: document admin audit ledger release"
```

---

## Final Verification Checklist

Before handing back:

- [ ] `git status --short --branch` shows only expected generated or ignored files.
- [ ] `git diff --check` passes.
- [ ] Frontend lint/test/build pass or skipped commands are named with reason.
- [ ] Backend targeted unit/integration/architecture tests pass or skipped commands are named with reason.
- [ ] Playwright admin audit route test passes or skipped command is named with reason.
- [ ] Public-safety scan finds no new unsafe fixture/doc leaks.
- [ ] `CHANGELOG.md`, `docs/development/architecture.md`, and `docs/development/server-state-migration.md` match shipped behavior.
- [ ] No raw `metadata_json`, email body, raw provider error, transcript, generated result JSON, token, private domain, deployment identifier, or local path is exposed in UI/API fixtures.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-05-27-readmates-admin-vnext-audit-ledger.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
