# ReadMates Admin vNext Operating Console Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

```yaml waygent-task
id: phase_1_s5_backend_read_models
title: Phase 1A — Add admin notification/outbox read contracts, ports, persistence adapter, and service. Do not create git commits from the task worktree.
dependencies: []
file_claims:
  - path: server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationOperationsPorts.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapterTest.kt
    mode: owned
risk: high
verify_isolation: medium
verify:
  - ./server/gradlew -p server unitTest --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest"
  - ./server/gradlew -p server integrationTest --tests "com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationOperationsAdapterTest"
instructions:
  - Implement Tasks 1 and 2 from the plan body.
  - Keep response models masked and public-safe.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_1_s5_backend_replay_controller
title: Phase 1B — Add two-step admin replay, audit-ready records, controller DTOs, and controller tests. Do not create git commits from the task worktree.
dependencies: [phase_1_s5_backend_read_models]
file_claims:
  - path: server/src/main/resources/db/mysql/migration/V35__admin_notification_replay_previews.sql
    mode: owned
  - path: server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationOperationsPorts.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationController.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationWebDtos.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/notification/api/PlatformAdminNotificationControllerTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt
    mode: modify
risk: high
verify_isolation: medium
verify:
  - ./server/gradlew -p server unitTest --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest"
  - ./server/gradlew -p server integrationTest --tests "com.readmates.notification.api.PlatformAdminNotificationControllerTest"
instructions:
  - Implement Tasks 3 and 4 from the plan body.
  - Replay must remain preview-then-confirm.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_1_s5_frontend_route
title: Phase 1C — Flip /admin/notifications to READY with route, API, Query, UI, styles, and E2E drill-down. Do not create git commits from the task worktree.
dependencies: [phase_1_s5_backend_replay_controller]
file_claims:
  - path: front/features/platform-admin/model/platform-admin-notifications-model.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-notifications-api.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-contracts.ts
    mode: modify
  - path: front/features/platform-admin/queries/platform-admin-notifications-queries.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-notifications-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-notifications-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-notifications-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-notifications-page.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-notifications-page.test.tsx
    mode: owned
  - path: front/features/platform-admin/model/admin-route-catalog.ts
    mode: modify
  - path: front/features/platform-admin/model/admin-route-catalog.test.ts
    mode: modify
  - path: front/features/platform-admin/ui/admin-layout-nav.test.tsx
    mode: modify
  - path: front/src/app/routes/admin.tsx
    mode: modify
  - path: front/src/styles/globals.css
    mode: modify
  - path: front/tests/e2e/admin-health.spec.ts
    mode: modify
  - path: front/tests/e2e/admin-notifications.spec.ts
    mode: owned
risk: high
verify_isolation: fast
verify:
  - pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx
  - pnpm --dir front exec playwright test tests/e2e/admin-health.spec.ts tests/e2e/admin-notifications.spec.ts --project=chromium
instructions:
  - Implement Tasks 5, 6, and 7 from the plan body.
  - Keep all fixture identities public-safe.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_2_s3_backend_club_operations
title: Phase 2A — Add AdminClubOperationsSnapshot backend contract, service, persistence, and controller. Do not create git commits from the task worktree.
dependencies: [phase_1_s5_backend_read_models]
file_claims:
  - path: server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsPorts.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt
    mode: owned
risk: high
verify_isolation: medium
verify:
  - ./server/gradlew -p server unitTest --tests "com.readmates.club.application.service.AdminClubOperationsServiceTest"
  - ./server/gradlew -p server integrationTest --tests "com.readmates.club.api.PlatformAdminClubOperationsControllerTest"
instructions:
  - Implement Tasks 8 and 9 from the plan body.
  - Keep the snapshot aggregate-only by default.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_2_s3_frontend_club_operations
title: Phase 2B — Render /admin/clubs/:id operations snapshot with route tests and E2E. Do not create git commits from the task worktree.
dependencies: [phase_2_s3_backend_club_operations, phase_1_s5_frontend_route]
file_claims:
  - path: front/features/platform-admin/model/platform-admin-club-operations-model.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-club-operations-api.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-contracts.ts
    mode: modify
  - path: front/features/platform-admin/queries/platform-admin-club-operations-queries.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-club-detail-data.ts
    mode: modify
  - path: front/features/platform-admin/route/admin-club-detail-route.tsx
    mode: modify
  - path: front/features/platform-admin/route/admin-club-detail-route.test.tsx
    mode: modify
  - path: front/features/platform-admin/ui/admin-club-operations-page.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-club-operations-page.test.tsx
    mode: owned
  - path: front/src/styles/globals.css
    mode: modify
  - path: front/tests/e2e/admin-club-operations.spec.ts
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/admin-club-operations-page.test.tsx
  - pnpm --dir front exec playwright test tests/e2e/admin-club-operations.spec.ts --project=chromium
instructions:
  - Implement Tasks 10 and 11 from the plan body.
  - Do not duplicate host-owned commands in admin UI.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_3_s4_backend_support_workbench
title: Phase 3A — Add admin support search, strengthened grant validation, and support workbench controller. Do not create git commits from the task worktree.
dependencies: []
file_claims:
  - path: server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/club/application/model/AdminSupportModels.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/application/port/in/SupportAccessGrantUseCases.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/club/application/port/out/AdminSupportPorts.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/application/service/AdminSupportWorkbenchService.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminSupportSearchAdapter.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcSupportAccessGrantAdapter.kt
    mode: modify
  - path: server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminSupportWorkbenchController.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/club/application/service/AdminSupportWorkbenchServiceTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportWorkbenchControllerTest.kt
    mode: owned
risk: high
verify_isolation: medium
verify:
  - ./server/gradlew -p server unitTest --tests "com.readmates.club.application.service.AdminSupportWorkbenchServiceTest" --tests "com.readmates.club.application.service.SupportAccessGrantServiceTest"
  - ./server/gradlew -p server integrationTest --tests "com.readmates.club.api.PlatformAdminSupportWorkbenchControllerTest" --tests "com.readmates.club.api.SupportAccessGrantControllerTest"
instructions:
  - Implement Tasks 12 and 13 from the plan body.
  - Keep existing /api/admin/support-access-grants compatible but strengthen its validation.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_3_s4_frontend_support_workbench
title: Phase 3B — Replace /admin/support shell with search-based support workbench and E2E. Do not create git commits from the task worktree.
dependencies: [phase_3_s4_backend_support_workbench, phase_2_s3_frontend_club_operations]
file_claims:
  - path: front/features/platform-admin/model/platform-admin-support-model.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-support-api.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-contracts.ts
    mode: modify
  - path: front/features/platform-admin/queries/platform-admin-support-queries.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-support-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-support-route.tsx
    mode: modify
  - path: front/features/platform-admin/route/admin-support-route.test.tsx
    mode: modify
  - path: front/features/platform-admin/ui/admin-support-workbench.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-support-workbench.test.tsx
    mode: owned
  - path: front/src/app/routes/admin.tsx
    mode: modify
  - path: front/src/styles/globals.css
    mode: modify
  - path: front/tests/e2e/admin-support.spec.ts
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx
  - pnpm --dir front exec playwright test tests/e2e/admin-support.spec.ts --project=chromium
instructions:
  - Implement Tasks 14 and 15 from the plan body.
  - Grant creation must be unreachable until a search result is selected.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_4_release_docs_verification
title: Phase 4 — Update release notes, run integrated checks, and refresh Graphify if code changed. Do not create git commits from the task worktree.
dependencies: [phase_1_s5_frontend_route, phase_2_s3_frontend_club_operations, phase_3_s4_frontend_support_workbench]
file_claims:
  - path: CHANGELOG.md
    mode: owned
  - path: docs/development/architecture.md
    mode: modify
  - path: docs/development/server-state-migration.md
    mode: modify
risk: medium
verify_isolation: full
verify:
  - pnpm --dir front lint
  - pnpm --dir front test
  - pnpm --dir front build
  - pnpm --dir front test:e2e
  - ./server/gradlew -p server clean test
  - ./server/gradlew -p server architectureTest
  - ./scripts/build-public-release-candidate.sh
  - ./scripts/public-release-check.sh .tmp/public-release-candidate
  - graphify update .
  - git diff --check
instructions:
  - Implement Task 16 from the plan body.
  - Update docs only for behavior that actually shipped.
  - Do not execute git add or git commit from the task worktree.
```

**Goal:** Build the next ReadMates admin operating-console expansion in one phased implementation: actionable `/admin/notifications`, aggregate `/admin/clubs/:id` operations snapshots, and searchable `/admin/support` grants.

**Architecture:** Keep the existing frontend route-first structure and server feature-local clean architecture. Notification/outbox admin operations stay in the `notification` feature; club operations and support workbench stay in the `club` feature; frontend route modules own Query seeding and UI prop assembly while UI components stay prop/callback driven.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Playwright, Vite, Kotlin/Spring Boot, MockMvc, JUnit 5, AssertJ, MySQL/Flyway.

**Spec:** [`docs/superpowers/specs/2026-05-27-readmates-admin-vnext-operating-console-expansion-design.md`](../specs/2026-05-27-readmates-admin-vnext-operating-console-expansion-design.md)

---

## Current Source State

- `/admin/health` is READY and health cards drill to `/admin/notifications`.
- `/admin/notifications`, `/admin/audit`, and `/admin/analytics` are still coming-soon routes in `front/features/platform-admin/model/admin-route-catalog.ts`.
- `/admin/support` is READY but renders only a light shell that points to club detail support grants.
- `/admin/clubs/:id` renders club metadata only and already fetches selected-club support grants.
- Host notification APIs already expose club-scoped event, delivery, manual dispatch, retry, restore, and test-mail flows under `/api/host/notifications`.
- Notification persistence already has `notification_event_outbox`, `notification_deliveries`, `member_notifications`, `notification_manual_dispatch_previews`, and `notification_manual_dispatches`.
- Support grants already write `platform_audit_events`, but current validation only covers OWNER permission and non-blank reason.

## File Structure

### Phase 1: S5 Notification / Outbox

Create server files:

- `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationOperationsPorts.kt`
- `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationController.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationWebDtos.kt`
- `server/src/main/resources/db/mysql/migration/V35__admin_notification_replay_previews.sql`

Modify server files:

- `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`

Create frontend files:

- `front/features/platform-admin/model/platform-admin-notifications-model.ts`
- `front/features/platform-admin/api/platform-admin-notifications-api.ts`
- `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- `front/features/platform-admin/route/admin-notifications-data.ts`
- `front/features/platform-admin/route/admin-notifications-route.tsx`
- `front/features/platform-admin/ui/admin-notifications-page.tsx`
- `front/tests/e2e/admin-notifications.spec.ts`

Modify frontend files:

- `front/features/platform-admin/api/platform-admin-contracts.ts`
- `front/features/platform-admin/model/admin-route-catalog.ts`
- `front/src/app/routes/admin.tsx`
- `front/src/styles/globals.css`
- `front/tests/e2e/admin-health.spec.ts`

### Phase 2: S3 Club Operations

Create server files:

- `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsPorts.kt`
- `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`

Modify server files:

- `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`

Create frontend files:

- `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- `front/features/platform-admin/api/platform-admin-club-operations-api.ts`
- `front/features/platform-admin/queries/platform-admin-club-operations-queries.ts`
- `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- `front/tests/e2e/admin-club-operations.spec.ts`

Modify frontend files:

- `front/features/platform-admin/api/platform-admin-contracts.ts`
- `front/features/platform-admin/route/admin-club-detail-data.ts`
- `front/features/platform-admin/route/admin-club-detail-route.tsx`
- `front/src/styles/globals.css`

### Phase 3: S4 Support Workbench

Create server files:

- `server/src/main/kotlin/com/readmates/club/application/model/AdminSupportModels.kt`
- `server/src/main/kotlin/com/readmates/club/application/port/out/AdminSupportPorts.kt`
- `server/src/main/kotlin/com/readmates/club/application/service/AdminSupportWorkbenchService.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminSupportSearchAdapter.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminSupportWorkbenchController.kt`

Modify server files:

- `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`
- `server/src/main/kotlin/com/readmates/club/application/port/in/SupportAccessGrantUseCases.kt`
- `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcSupportAccessGrantAdapter.kt`

Create frontend files:

- `front/features/platform-admin/model/platform-admin-support-model.ts`
- `front/features/platform-admin/api/platform-admin-support-api.ts`
- `front/features/platform-admin/queries/platform-admin-support-queries.ts`
- `front/features/platform-admin/route/admin-support-data.ts`
- `front/features/platform-admin/ui/admin-support-workbench.tsx`
- `front/tests/e2e/admin-support.spec.ts`

Modify frontend files:

- `front/features/platform-admin/api/platform-admin-contracts.ts`
- `front/features/platform-admin/route/admin-support-route.tsx`
- `front/src/app/routes/admin.tsx`
- `front/src/styles/globals.css`

## Task 1 — S5 Server Models, Use Case, And Ports

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationOperationsPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt`

- [ ] Add admin notification application models.

`AdminNotificationOperationsModels.kt` should define these public application models:

```kotlin
package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import java.time.OffsetDateTime
import java.util.UUID

data class AdminNotificationOperationsSnapshot(
    val generatedAt: OffsetDateTime,
    val outboxSummary: AdminNotificationStatusSummary,
    val deliverySummary: AdminNotificationStatusSummary,
    val relaySummary: AdminNotificationRelaySummary,
    val failureClusters: List<AdminNotificationFailureCluster>,
    val clubHealth: List<AdminNotificationClubHealth>,
    val recentManualDispatches: List<AdminNotificationManualDispatchSummary>,
)

data class AdminNotificationStatusSummary(
    val pending: Int,
    val active: Int,
    val failed: Int,
    val dead: Int,
    val sentOrPublishedLast24h: Int,
)

data class AdminNotificationRelaySummary(
    val publishing: Int,
    val sending: Int,
    val stalePublishing: Int,
    val staleSending: Int,
)

data class AdminNotificationFailureCluster(
    val safeErrorCode: String,
    val status: String,
    val count: Int,
    val latestAt: OffsetDateTime?,
)

data class AdminNotificationClubHealth(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val lastSuccessAt: OffsetDateTime?,
)

data class AdminNotificationManualDispatchSummary(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val clubName: String,
    val eventType: NotificationEventType,
    val eventStatus: NotificationEventOutboxStatus,
    val targetCount: Int,
    val createdAt: OffsetDateTime,
)

data class AdminNotificationOutboxEvent(
    val eventId: UUID,
    val club: AdminNotificationClubRef,
    val eventType: NotificationEventType,
    val source: NotificationDispatchSource,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val nextAttemptAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val safeErrorCode: String?,
    val manualDispatch: AdminNotificationManualDispatchMetadata?,
)

data class AdminNotificationDelivery(
    val deliveryId: UUID,
    val eventId: UUID,
    val club: AdminNotificationClubRef,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val maskedRecipient: String?,
    val attemptCount: Int,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val safeErrorCode: String?,
)

data class AdminNotificationClubRef(
    val clubId: UUID,
    val slug: String,
    val name: String,
)

data class AdminNotificationManualDispatchMetadata(
    val manualDispatchId: UUID,
    val requestedBy: String,
    val targetCount: Int,
)

data class AdminNotificationFilter(
    val clubId: UUID? = null,
    val eventStatus: NotificationEventOutboxStatus? = null,
    val deliveryStatus: NotificationDeliveryStatus? = null,
    val channel: NotificationChannel? = null,
)
```

- [ ] Add admin notification ports.

`AdminNotificationOperationsPorts.kt` should contain:

```kotlin
package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest

interface AdminNotificationOperationsReadPort {
    fun snapshot(): AdminNotificationOperationsSnapshot

    fun listEvents(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent>

    fun listDeliveries(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery>
}
```

- [ ] Extend inbound use cases in `NotificationUseCases.kt`.

Add this interface without changing existing host notification contracts:

```kotlin
interface ManageAdminNotificationOperationsUseCase {
    fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot

    fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent>

    fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery>
}
```

Add imports for `CurrentPlatformAdmin`, `CursorPage`, and the new admin models.

- [ ] Write the failing service tests.

`AdminNotificationOperationsServiceTest.kt` should include:

```kotlin
@Test
fun `support can read snapshot but cannot replay`() {
    val service = serviceWith(readPort = fakeReadPort())
    val snapshot = service.snapshot(platformAdmin("SUPPORT"))
    assertThat(snapshot.outboxSummary.pending).isEqualTo(2)
}

@Test
fun `memberless admin filters are passed to read port`() {
    val readPort = RecordingAdminNotificationReadPort()
    serviceWith(readPort = readPort).listEvents(
        admin = platformAdmin("OWNER"),
        filter = AdminNotificationFilter(clubId = CLUB_ID, eventStatus = NotificationEventOutboxStatus.FAILED),
        pageRequest = PageRequest.cursor(limit = 20, cursor = null, defaultLimit = 50, maxLimit = 100),
    )
    assertThat(readPort.lastFilter?.clubId).isEqualTo(CLUB_ID)
    assertThat(readPort.lastFilter?.eventStatus).isEqualTo(NotificationEventOutboxStatus.FAILED)
}
```

Use local fake ports and deterministic UUID constants in the test file.

- [ ] Run the tests to verify they fail before implementation:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest"
```

Expected before implementation: compile failure for missing model/service classes.

## Task 2 — S5 Server Read Adapter And Service

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapterTest.kt`

- [ ] Implement `AdminNotificationOperationsService`.

Service behavior:

```kotlin
@Service
class AdminNotificationOperationsService(
    private val readPort: AdminNotificationOperationsReadPort,
) : ManageAdminNotificationOperationsUseCase {
    override fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot =
        readPort.snapshot()

    override fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> =
        readPort.listEvents(filter, pageRequest.copy(limit = pageRequest.limit.coerceIn(1, MAX_ADMIN_NOTIFICATION_LIMIT)))

    override fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> =
        readPort.listDeliveries(filter, pageRequest.copy(limit = pageRequest.limit.coerceIn(1, MAX_ADMIN_NOTIFICATION_LIMIT)))
}

private const val MAX_ADMIN_NOTIFICATION_LIMIT = 100
```

- [ ] Implement `JdbcAdminNotificationOperationsAdapter`.

The adapter should:

- use `utc_timestamp(6)` windows in SQL;
- group failure clusters by `coalesce(nullif(last_error, ''), 'unknown')` after sanitizing to a low-cardinality safe code in Kotlin;
- return masked recipients by reusing the existing row-mapper masking helper if available, or by adding a local `maskEmailForAdmin` helper with the same visible behavior as host responses;
- join `clubs` for `clubId`, `slug`, and `name`;
- never select email body columns or notification payload bodies into response models.

Required query methods:

```kotlin
override fun snapshot(): AdminNotificationOperationsSnapshot
override fun listEvents(filter: AdminNotificationFilter, pageRequest: PageRequest): CursorPage<AdminNotificationOutboxEvent>
override fun listDeliveries(filter: AdminNotificationFilter, pageRequest: PageRequest): CursorPage<AdminNotificationDelivery>
```

Cursor ordering must be `updated_at desc, created_at desc, id desc`, matching existing host ledgers.

- [ ] Write integration tests for the adapter.

`JdbcAdminNotificationOperationsAdapterTest.kt` should seed:

- one failed event in the baseline club;
- one dead delivery in the baseline club;
- one row in a second club;
- one manual dispatch row linked to an event.

Assertions:

- snapshot contains both clubs;
- masked recipient is present and raw recipient is absent;
- event and delivery pages return `nextCursor` when `limit=1`;
- failure cluster safe code does not include an email, token, SQL detail, or raw SMTP text.

- [ ] Run the adapter tests:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationOperationsAdapterTest"
```

Expected after implementation: pass.

## Task 3 — S5 Replay Preview, Confirm, And Audit

**Files:**

- Add: `server/src/main/resources/db/mysql/migration/V35__admin_notification_replay_previews.sql`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationOperationsPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt`

- [ ] Add the replay preview migration.

`V35__admin_notification_replay_previews.sql`:

```sql
create table admin_notification_replay_previews (
  id char(36) not null,
  actor_user_id char(36) not null,
  filter_json json not null,
  selection_hash char(64) not null,
  matched_count int not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key admin_notification_replay_previews_actor_created_idx (actor_user_id, created_at),
  key admin_notification_replay_previews_expires_idx (expires_at),
  constraint admin_notification_replay_previews_actor_fk foreign key (actor_user_id) references users(id),
  constraint admin_notification_replay_previews_count_check check (matched_count >= 0),
  constraint admin_notification_replay_previews_hash_check check (length(selection_hash) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
```

- [ ] Add replay models.

Append to `AdminNotificationOperationsModels.kt`:

```kotlin
data class AdminNotificationReplayPreviewRequest(
    val filter: AdminNotificationFilter,
)

data class AdminNotificationReplayPreview(
    val previewId: UUID,
    val selectionHash: String,
    val matchedCount: Int,
    val excludedCount: Int,
    val estimatedByStatus: Map<String, Int>,
    val warnings: List<String>,
    val expiresAt: OffsetDateTime,
)

data class AdminNotificationReplayConfirmCommand(
    val previewId: UUID,
    val selectionHash: String,
    val reason: String,
)

data class AdminNotificationReplayConfirmResult(
    val replayedCount: Int,
    val skippedCount: Int,
    val selectionHash: String,
)
```

- [ ] Extend the use case with preview and confirm methods.

```kotlin
fun previewReplay(
    admin: CurrentPlatformAdmin,
    request: AdminNotificationReplayPreviewRequest,
): AdminNotificationReplayPreview

fun confirmReplay(
    admin: CurrentPlatformAdmin,
    command: AdminNotificationReplayConfirmCommand,
): AdminNotificationReplayConfirmResult
```

- [ ] Extend ports for preview persistence, replayable selection, replay mutation, and admin audit.

Add to `AdminNotificationOperationsPorts.kt`:

```kotlin
interface AdminNotificationReplayPort {
    fun createPreview(
        actorUserId: UUID,
        filterJson: String,
        selectionHash: String,
        matchedCount: Int,
        expiresAt: OffsetDateTime,
    ): UUID

    fun loadOpenPreview(previewId: UUID): AdminNotificationReplayPreviewRecord?

    fun markPreviewConsumed(previewId: UUID): Boolean

    fun replayDeadOrFailedDeliveries(filter: AdminNotificationFilter): Int
}

interface AdminNotificationAuditPort {
    fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
    )
}

data class AdminNotificationReplayPreviewRecord(
    val previewId: UUID,
    val actorUserId: UUID,
    val filterJson: String,
    val selectionHash: String,
    val matchedCount: Int,
    val expiresAt: OffsetDateTime,
)
```

- [ ] Implement service rules.

Rules:

- OWNER and OPERATOR can preview and confirm replay.
- SUPPORT cannot confirm replay.
- Preview selects only `FAILED` and `DEAD` email deliveries.
- Confirm rejects blank reason.
- Confirm rejects expired previews.
- Confirm rejects mismatched actor.
- Confirm rejects mismatched selection hash.
- Confirm writes event type `ADMIN_NOTIFICATION_REPLAY_CONFIRMED`.

Use metadata JSON keys:

```json
{
  "previewId": "uuid",
  "selectionHash": "hex",
  "reason": "operator-entered reason",
  "replayedCount": 3,
  "skippedCount": 0
}
```

- [ ] Extend unit tests for permission, blank reason, expired preview, selection hash mismatch, and audit metadata.

- [ ] Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.notification.application.service.AdminNotificationOperationsServiceTest"
```

Expected after implementation: pass.

## Task 4 — S5 Controller DTOs And Integration Tests

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationController.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/PlatformAdminNotificationControllerTest.kt`

- [ ] Create controller routes.

`PlatformAdminNotificationController` should expose:

```kotlin
@RestController
@RequestMapping("/api/admin/notifications")
class PlatformAdminNotificationController(
    private val useCase: ManageAdminNotificationOperationsUseCase,
) {
    @GetMapping("/snapshot")
    fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshotResponse

    @GetMapping("/events")
    fun events(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) status: NotificationEventOutboxStatus?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<AdminNotificationOutboxEventResponse>

    @GetMapping("/deliveries")
    fun deliveries(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) status: NotificationDeliveryStatus?,
        @RequestParam(required = false) channel: NotificationChannel?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<AdminNotificationDeliveryResponse>

    @PostMapping("/replay-preview")
    fun preview(admin: CurrentPlatformAdmin, @RequestBody request: AdminNotificationReplayPreviewRequestBody): AdminNotificationReplayPreviewResponse

    @PostMapping("/replay-confirm")
    fun confirm(admin: CurrentPlatformAdmin, @RequestBody request: AdminNotificationReplayConfirmRequestBody): AdminNotificationReplayConfirmResponse
}
```

Use existing `CurrentPlatformAdmin` resolution; do not accept club-scoped `CurrentMember`.

- [ ] Create DTOs in `PlatformAdminNotificationWebDtos.kt`.

DTOs should mirror frontend camelCase:

- `generatedAt`
- `outboxSummary`
- `deliverySummary`
- `relaySummary`
- `failureClusters`
- `clubHealth`
- `recentManualDispatches`
- `maskedRecipient`
- `safeErrorCode`
- `previewId`
- `selectionHash`
- `matchedCount`
- `estimatedByStatus`

- [ ] Write controller integration tests.

Test cases:

- OWNER gets snapshot.
- SUPPORT gets snapshot with masked recipients.
- guest/member is denied by platform admin resolver.
- replay preview returns `previewId` and `selectionHash`.
- replay confirm returns replay count for OWNER.
- replay confirm returns forbidden for SUPPORT.
- response body never contains raw recipient email or raw SMTP text.

Use session cookies as in `SupportAccessGrantControllerTest`, not a host `CurrentMember`.

- [ ] Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.notification.api.PlatformAdminNotificationControllerTest"
```

Expected after implementation: pass.

## Task 5 — S5 Frontend Contracts, API, Query, And Route Wiring

**Files:**

- Create: `front/features/platform-admin/model/platform-admin-notifications-model.ts`
- Create: `front/features/platform-admin/api/platform-admin-notifications-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- Create: `front/features/platform-admin/route/admin-notifications-data.ts`
- Create: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/src/app/routes/admin.tsx`
- Test: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Test: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`

- [ ] Add TypeScript contracts.

`platform-admin-notifications-model.ts` should define:

```ts
export type AdminNotificationStatusSummary = {
  pending: number;
  active: number;
  failed: number;
  dead: number;
  sentOrPublishedLast24h: number;
};

export type AdminNotificationOperationsSnapshot = {
  generatedAt: string;
  outboxSummary: AdminNotificationStatusSummary;
  deliverySummary: AdminNotificationStatusSummary;
  relaySummary: {
    publishing: number;
    sending: number;
    stalePublishing: number;
    staleSending: number;
  };
  failureClusters: Array<{ safeErrorCode: string; status: string; count: number; latestAt: string | null }>;
  clubHealth: Array<{ clubId: string; slug: string; name: string; pending: number; failed: number; dead: number; lastSuccessAt: string | null }>;
  recentManualDispatches: Array<{ manualDispatchId: string; eventId: string; clubId: string; clubName: string; eventType: string; eventStatus: string; targetCount: number; createdAt: string }>;
};

export type AdminNotificationOutboxEvent = {
  eventId: string;
  club: { clubId: string; slug: string; name: string };
  eventType: string;
  source: "AUTOMATIC" | "MANUAL";
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  safeErrorCode: string | null;
  manualDispatch: null | { manualDispatchId: string; requestedBy: string; targetCount: number };
};

export type AdminNotificationDelivery = {
  deliveryId: string;
  eventId: string;
  club: { clubId: string; slug: string; name: string };
  channel: "EMAIL" | "IN_APP";
  status: string;
  maskedRecipient: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  safeErrorCode: string | null;
};

export type AdminNotificationReplayPreview = {
  previewId: string;
  selectionHash: string;
  matchedCount: number;
  excludedCount: number;
  estimatedByStatus: Record<string, number>;
  warnings: string[];
  expiresAt: string;
};

export type AdminNotificationFilters = {
  clubId?: string;
  eventStatus?: string;
  deliveryStatus?: string;
  channel?: "EMAIL" | "IN_APP";
  cursor?: string;
};

export type AdminNotificationReplayFilter = {
  clubId?: string;
  deliveryStatus?: string;
  channel?: "EMAIL" | "IN_APP";
};

export type AdminNotificationReplayConfirmRequest = {
  previewId: string;
  selectionHash: string;
  reason: string;
};
```

Export these types from `platform-admin-contracts.ts`.

- [ ] Add API functions.

`platform-admin-notifications-api.ts`:

```ts
import { readmatesFetch } from "@/shared/api/client";
import type {
  AdminNotificationDelivery,
  AdminNotificationFilters,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayConfirmRequest,
  AdminNotificationReplayFilter,
  AdminNotificationReplayPreview,
} from "@/features/platform-admin/model/platform-admin-notifications-model";
import type { PagedResponse } from "@/shared/model/paging";

function notificationSearch(filters: AdminNotificationFilters): string {
  const params = new URLSearchParams();
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.eventStatus) params.set("status", filters.eventStatus);
  if (filters.deliveryStatus) params.set("status", filters.deliveryStatus);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function fetchAdminNotificationSnapshot() {
  return readmatesFetch<AdminNotificationOperationsSnapshot>(
    "/api/admin/notifications/snapshot",
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminNotificationEvents(filters: AdminNotificationFilters = {}) {
  return readmatesFetch<PagedResponse<AdminNotificationOutboxEvent>>(
    `/api/admin/notifications/events${notificationSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminNotificationDeliveries(filters: AdminNotificationFilters = {}) {
  return readmatesFetch<PagedResponse<AdminNotificationDelivery>>(
    `/api/admin/notifications/deliveries${notificationSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function previewAdminNotificationReplay(filter: AdminNotificationReplayFilter) {
  return readmatesFetch<AdminNotificationReplayPreview>(
    "/api/admin/notifications/replay-preview",
    { method: "POST", body: JSON.stringify({ filter }) },
    { clubSlug: undefined },
  );
}

export function confirmAdminNotificationReplay(request: AdminNotificationReplayConfirmRequest) {
  return readmatesFetch<{ replayedCount: number; skippedCount: number; selectionHash: string }>(
    "/api/admin/notifications/replay-confirm",
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  );
}
```

All calls must pass `{ clubSlug: undefined }`.

- [ ] Add Query helpers.

Use query keys under `["platform-admin", "notifications"]`. Mutations invalidate the notifications root on confirm success.

- [ ] Add route loader.

`adminNotificationsLoaderFactory(queryClient)` should seed snapshot, first events page, and first deliveries page.

- [ ] Flip route catalog and route wiring.

In `admin-route-catalog.ts`, make `notifications` `status: "ready"` and remove its `comingSoon` block.

In `front/src/app/routes/admin.tsx`, add a `case "notifications"` ready child that imports:

```ts
import("@/features/platform-admin/route/admin-notifications-route")
import("@/features/platform-admin/route/admin-notifications-data")
```

- [ ] Update nav/catalog tests.

Expected ready routes after S5:

```ts
["ai-ops", "clubs", "health", "notifications", "support", "today"]
```

`admin-layout-nav.test.tsx` should assert the notifications item does not include `준비 중`.

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx
```

Expected after implementation: pass.

## Task 6 — S5 Frontend UI And Route Tests

**Files:**

- Create: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Create: `front/features/platform-admin/ui/admin-notifications-page.test.tsx`
- Create: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/src/styles/globals.css`

- [ ] Build `AdminNotificationsPage`.

Props:

```ts
type AdminNotificationsPageProps = {
  snapshot: AdminNotificationOperationsSnapshot;
  events: AdminNotificationOutboxEvent[];
  deliveries: AdminNotificationDelivery[];
  focus: string | null;
  replayPreview: AdminNotificationReplayPreview | null;
  replayReason: string;
  canReplay: boolean;
  busy: boolean;
  error: string | null;
  onPreviewReplay: () => Promise<void>;
  onConfirmReplay: () => Promise<void>;
  onReplayReasonChange: (value: string) => void;
};
```

UI sections:

- summary strip;
- focus banner when `focus` is `outbox_backlog` or `notification_dispatch_success`;
- failure clusters;
- events ledger;
- deliveries ledger;
- replay preview/confirm panel.

Replay confirm button is disabled unless `replayPreview` exists, `replayReason.trim()` is non-empty, `canReplay` is true, and `busy` is false.

- [ ] Route module owns Query and mutation state.

`AdminNotificationsRoute` reads seeded Query data, reads `focus` from `useSearchParams`, and passes props to `AdminNotificationsPage`.

Use safe Korean copy:

- preview loading: `재처리 대상을 확인하는 중입니다.`
- confirm loading: `재처리를 기록하는 중입니다.`
- permission: `현재 역할은 재처리를 실행할 수 없습니다.`
- generic error: `알림 운영 정보를 처리하지 못했습니다. 다시 시도해 주세요.`

- [ ] Add CSS classes in `globals.css`.

Use `admin-notifications-*` class names. Keep layout dense, calm, and ledger-like:

- constrained width;
- summary grid;
- table/list rows with stable spacing;
- mobile rows stack without text overlap;
- no decorative gradients or glow.

- [ ] Add UI tests.

Test cases:

- renders summary and failure clusters;
- renders masked recipient and never raw email fixture;
- focus banner appears from focus prop;
- confirm disabled until preview and reason exist;
- support role message appears when `canReplay=false`.

- [ ] Add route tests.

Seed Query data and assert route passes focus from URL:

```tsx
<MemoryRouter initialEntries={["/admin/notifications?focus=outbox_backlog"]}>
```

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx
```

Expected after implementation: pass.

## Task 7 — S5 E2E Drill-Down

**Files:**

- Modify: `front/tests/e2e/admin-health.spec.ts`
- Create: `front/tests/e2e/admin-notifications.spec.ts`

- [ ] Update `admin-health.spec.ts`.

When clicking the Outbox backlog card link, assert navigation to `/admin/notifications` and visible focus state.

Use a route fulfill for:

- `**/api/bff/api/admin/notifications/snapshot`
- `**/api/bff/api/admin/notifications/events**`
- `**/api/bff/api/admin/notifications/deliveries**`

- [ ] Add `admin-notifications.spec.ts`.

Cover:

- page renders summary, events, deliveries;
- raw recipient email does not appear;
- preview returns `matchedCount`;
- confirm requires a reason;
- confirm success updates visible copy.

- [ ] Run:

```bash
pnpm --dir front exec playwright test tests/e2e/admin-health.spec.ts tests/e2e/admin-notifications.spec.ts --project=chromium
```

Expected after implementation: pass.

## Task 8 — S3 Backend Snapshot Contract And Service

**Files:**

- Create: `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`

- [ ] Add `AdminClubOperationsSnapshot` models.

Use this shape:

```kotlin
data class AdminClubOperationsSnapshot(
    val schema: String = "admin.club_operations_snapshot.v1",
    val generatedAt: OffsetDateTime,
    val club: AdminClubOperationsClub,
    val readiness: AdminClubReadinessSummary,
    val memberActivity: AdminClubMemberActivity,
    val sessionProgress: AdminClubSessionProgress,
    val notificationHealth: AdminClubNotificationHealth,
    val aiUsage: AdminClubAiUsage,
    val safeLinks: List<AdminClubSafeLink>,
)
```

Include nested data classes for every field named in the spec. Counts are integers. Cost estimate is a string to match existing AI Ops cost contracts.

- [ ] Add inbound use case.

`PlatformAdminUseCases.kt`:

```kotlin
interface GetAdminClubOperationsUseCase {
    fun operationsSnapshot(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
    ): AdminClubOperationsSnapshot
}
```

- [ ] Add outbound port.

`AdminClubOperationsPorts.kt`:

```kotlin
interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?
}
```

- [ ] Implement service.

Rules:

- OWNER/OPERATOR/SUPPORT can read.
- If port returns null, throw `PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")`.
- Service does not perform host-owned mutations.

- [ ] Add service tests for read permission, not found, and schema value.

- [ ] Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.club.application.service.AdminClubOperationsServiceTest"
```

Expected after implementation: pass.

## Task 9 — S3 Backend Persistence And Controller

**Files:**

- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`

- [ ] Implement snapshot SQL aggregation.

Adapter output:

- club identity from `clubs`;
- readiness from current club fields and domain status;
- member activity from `memberships`;
- session progress from `sessions`;
- notification health from `notification_deliveries`;
- AI usage from existing AI audit/job tables only when tables and query helpers already exist in current code;
- safe links for host app and admin notifications.

If an AI aggregate query is unavailable in current code, return zero/insufficient state from the adapter and document the missing data in the snapshot's `aiUsage.state` field. Do not invent mock data.

- [ ] Controller route.

Expose:

```kotlin
@GetMapping("/api/admin/clubs/{clubId}/operations")
fun operations(admin: CurrentPlatformAdmin, @PathVariable clubId: UUID): AdminClubOperationsSnapshotResponse
```

Response DTO uses camelCase names and maps the schema string unchanged.

- [ ] Integration tests.

`PlatformAdminClubOperationsControllerTest` should assert:

- OWNER can read baseline club;
- SUPPORT can read aggregate snapshot;
- missing club returns 404;
- response contains `admin.club_operations_snapshot.v1`;
- response does not contain raw member emails or note/review body text.

- [ ] Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.club.api.PlatformAdminClubOperationsControllerTest"
```

Expected after implementation: pass.

## Task 10 — S3 Frontend Contracts, Query, And Loader

**Files:**

- Create: `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- Create: `front/features/platform-admin/api/platform-admin-club-operations-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-club-operations-queries.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/route/admin-club-detail-data.ts`

- [ ] Add TypeScript model matching server response.

Use:

```ts
export type AdminClubOperationsSnapshot = {
  schema: "admin.club_operations_snapshot.v1";
  generatedAt: string;
  club: { clubId: string; slug: string; name: string; status: string; publicVisibility: string };
  readiness: { state: string; blockingReasons: string[]; nextAction: string | null };
  memberActivity: { activeCount: number; dormantCount: number; pendingViewerCount: number; hostCount: number };
  sessionProgress: { upcomingCount: number; currentOpenCount: number; closedCount: number; publishedRecordCount: number; incompleteRecordCount: number };
  notificationHealth: { pending: number; failed: number; dead: number; lastSuccessAt: string | null; failureClusters: Array<{ safeErrorCode: string; count: number }> };
  aiUsage: { activeJobs: number; failedRecentJobs: number; staleCandidates: number; costEstimateUsd: string; state: string };
  safeLinks: Array<{ label: string; href: string; kind: "ADMIN_ROUTE" | "HOST_ROUTE" }>;
};
```

- [ ] Add API and Query helper.

`fetchAdminClubOperationsSnapshot(clubId)` calls `/api/admin/clubs/${clubId}/operations`.

Query key:

```ts
["platform-admin", "club-operations", clubId]
```

- [ ] Update loader.

`adminClubDetailLoaderFactory` should fetch:

- `platformAdminClubsQuery()`;
- `platformAdminSupportGrantsQuery(clubId)`;
- `platformAdminClubOperationsQuery(clubId)`.

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx
```

Expected before route UI changes: tests may fail because route has not consumed the new query yet.

## Task 11 — S3 Frontend UI And E2E

**Files:**

- Create: `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Create: `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- Modify: `front/src/styles/globals.css`
- Create: `front/tests/e2e/admin-club-operations.spec.ts`

- [ ] Build `AdminClubOperationsPage`.

Props:

```ts
type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  supportGrantCount: number;
};
```

Sections:

- club identity and readiness;
- member activity aggregate;
- session progress aggregate;
- notification health with link to `/admin/notifications?clubId=${clubId}`;
- AI usage with link to `/admin/ai-ops?clubId=${clubId}`;
- safe links.

Do not render host-owned command buttons.

- [ ] Update route.

`AdminClubDetailRoute` should render `AdminClubOperationsPage` when snapshot data exists. Keep the not-found state for unknown `clubId`.

- [ ] Add UI tests.

Assert:

- snapshot heading renders;
- notification link includes selected club id;
- support grant count is shown as a summary;
- no button text for RSVP, attendance, session edit, or publication body exists.

- [ ] Add E2E fixture.

`admin-club-operations.spec.ts` should mock:

- auth/me as platform OWNER;
- admin summary;
- admin clubs with one club;
- support grants empty list;
- club operations snapshot.

Assert the operations route renders and raw email text is absent.

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/admin-club-operations-page.test.tsx
pnpm --dir front exec playwright test tests/e2e/admin-club-operations.spec.ts --project=chromium
```

Expected after implementation: pass.

## Task 12 — S4 Backend Search And Grant Validation

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/model/AdminSupportModels.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/AdminSupportPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/AdminSupportWorkbenchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/SupportAccessGrantUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcSupportAccessGrantAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminSupportSearchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/AdminSupportWorkbenchServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt`

- [ ] Extend `PlatformAdminError`.

Add:

```kotlin
SUPPORT_TARGET_NOT_FOUND,
SUPPORT_TARGET_NOT_ELIGIBLE,
GRANT_EXPIRY_REQUIRED,
GRANT_EXPIRY_IN_PAST,
GRANT_EXPIRY_TOO_LONG,
GRANT_DUPLICATE_ACTIVE,
```

- [ ] Add support models.

`AdminSupportModels.kt`:

```kotlin
data class AdminSupportSearchResult(
    val subjectId: UUID,
    val displayName: String,
    val maskedEmail: String,
    val kind: String,
    val platformAdminRole: PlatformAdminRole?,
    val platformAdminStatus: String?,
    val clubMembershipSummary: List<AdminSupportClubMembershipSummary>,
    val grantEligible: Boolean,
    val grantBlockedReason: String?,
)

data class AdminSupportGrantLedgerItem(
    val grantId: UUID,
    val clubId: UUID,
    val clubName: String,
    val granteeUserId: UUID,
    val granteeDisplayName: String,
    val granteeMaskedEmail: String,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val status: String,
    val createdByRole: String,
)
```

- [ ] Add search port.

`AdminSupportPorts.kt`:

```kotlin
interface AdminSupportSearchPort {
    fun search(query: String, clubId: UUID?, limit: Int): List<AdminSupportSearchResult>
}

interface AdminSupportGrantLedgerPort {
    fun listLedger(clubId: UUID?, granteeUserId: UUID?, limit: Int): List<AdminSupportGrantLedgerItem>
    fun hasActiveGrant(clubId: UUID, granteeUserId: UUID): Boolean
    fun isGrantEligibleClub(clubId: UUID): Boolean
}
```

- [ ] Implement support search service.

Rules:

- OWNER and OPERATOR can search.
- SUPPORT gets only empty results unless a future task adds assigned-work context.
- Search trims input and rejects blank input.
- Limit result count to 10.
- Output is masked.

- [ ] Strengthen `SupportAccessGrantService`.

Add constructor dependencies for `AdminSupportGrantLedgerPort` and `AdminSupportSearchPort` only if needed for eligibility checks. Validate:

- reason non-blank;
- expiry future;
- expiry not beyond 24 hours by default;
- grantee is active platform admin;
- selected club is grant eligible;
- no duplicate active grant.

Keep existing `/api/admin/support-access-grants` compatible. It can still receive `granteeUserId`, but invalid grantees must fail safely.

- [ ] Unit tests.

Add tests for each validation rule and for OPERATOR/SUPPORT denial on create/revoke.

- [ ] Run:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.club.application.service.AdminSupportWorkbenchServiceTest" --tests "com.readmates.club.application.service.SupportAccessGrantServiceTest"
```

Expected after implementation: pass.

## Task 13 — S4 Backend Workbench Controller

**Files:**

- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminSupportWorkbenchController.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportWorkbenchControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`

- [ ] Add workbench routes.

Expose:

```kotlin
@GetMapping("/api/admin/support/search")
fun search(admin: CurrentPlatformAdmin, @RequestParam query: String, @RequestParam(required = false) clubId: UUID?): List<AdminSupportSearchResultResponse>

@GetMapping("/api/admin/support/grants")
fun grants(admin: CurrentPlatformAdmin, @RequestParam(required = false) clubId: UUID?, @RequestParam(required = false) granteeUserId: UUID?): List<AdminSupportGrantLedgerItemResponse>

@PostMapping("/api/admin/support/grants")
fun create(admin: CurrentPlatformAdmin, @RequestBody request: AdminSupportGrantRequest): SupportAccessGrantResponse

@DeleteMapping("/api/admin/support/grants/{grantId}")
@ResponseStatus(HttpStatus.NO_CONTENT)
fun revoke(admin: CurrentPlatformAdmin, @PathVariable grantId: UUID)
```

New create route delegates to existing `CreateSupportAccessGrantUseCase` after converting `granteeSubjectId` to `granteeUserId`.

- [ ] Controller tests.

Assert:

- OWNER search returns masked email;
- OPERATOR search returns masked email;
- SUPPORT search returns limited safe context or empty result as implemented in Task 12;
- create without a selected active platform admin returns bad request;
- create with valid selected grantee returns OK;
- revoke returns no content;
- old `/api/admin/support-access-grants` still rejects ineligible grantee.

- [ ] Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.club.api.PlatformAdminSupportWorkbenchControllerTest" --tests "com.readmates.club.api.SupportAccessGrantControllerTest"
```

Expected after implementation: pass.

## Task 14 — S4 Frontend Contracts, API, Query, And Loader

**Files:**

- Create: `front/features/platform-admin/model/platform-admin-support-model.ts`
- Create: `front/features/platform-admin/api/platform-admin-support-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-support-queries.ts`
- Create: `front/features/platform-admin/route/admin-support-data.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/src/app/routes/admin.tsx`

- [ ] Add support contracts.

`platform-admin-support-model.ts`:

```ts
export type AdminSupportSearchResult = {
  subjectId: string;
  displayName: string;
  maskedEmail: string;
  kind: string;
  platformAdminRole: "OWNER" | "OPERATOR" | "SUPPORT" | null;
  platformAdminStatus: string | null;
  clubMembershipSummary: Array<{ clubId: string; clubName: string; role: string; status: string }>;
  grantEligible: boolean;
  grantBlockedReason: string | null;
};

export type AdminSupportGrantLedgerItem = {
  grantId: string;
  clubId: string;
  clubName: string;
  granteeUserId: string;
  granteeDisplayName: string;
  granteeMaskedEmail: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  status: string;
  createdByRole: string;
};

export type AdminSupportGrantRequest = {
  clubId: string;
  granteeSubjectId: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
};
```

- [ ] Add API functions.

`platform-admin-support-api.ts`:

```ts
import { readmatesFetch } from "@/shared/api/client";
import type {
  AdminSupportGrantLedgerItem,
  AdminSupportGrantRequest,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";
import type { SupportAccessGrantResponse } from "@/features/platform-admin/api/platform-admin-contracts";

export function searchAdminSupportSubjects(query: string, clubId?: string) {
  const params = new URLSearchParams({ query });
  if (clubId) params.set("clubId", clubId);
  return readmatesFetch<AdminSupportSearchResult[]>(
    `/api/admin/support/search?${params.toString()}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminSupportGrantLedger(filters: { clubId?: string; granteeUserId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.granteeUserId) params.set("granteeUserId", filters.granteeUserId);
  const search = params.toString();
  return readmatesFetch<AdminSupportGrantLedgerItem[]>(
    `/api/admin/support/grants${search ? `?${search}` : ""}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function createAdminSupportGrant(request: AdminSupportGrantRequest) {
  return readmatesFetch<SupportAccessGrantResponse>(
    "/api/admin/support/grants",
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  );
}

export function revokeAdminSupportGrant(grantId: string) {
  return readmatesFetch<void>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE" },
    { clubSlug: undefined },
  );
}
```

All calls must pass `{ clubSlug: undefined }`.

- [ ] Add Query helpers and loader.

Use query keys under `["platform-admin", "support"]`.

`adminSupportLoaderFactory(queryClient)` should seed platform clubs for the club selector and support ledger if `clubId` exists in the URL.

- [ ] Wire ready route loader in `front/src/app/routes/admin.tsx` for the existing `support` case.

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx
```

Expected before UI replacement: existing test may fail because copy changes in Task 15.

## Task 15 — S4 Frontend Workbench UI And E2E

**Files:**

- Create: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Create: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`
- Modify: `front/src/styles/globals.css`
- Create: `front/tests/e2e/admin-support.spec.ts`

- [ ] Build `AdminSupportWorkbench`.

Props:

```ts
type AdminSupportWorkbenchProps = {
  clubs: PlatformAdminClub[];
  selectedClubId: string | null;
  query: string;
  results: AdminSupportSearchResult[];
  selectedResult: AdminSupportSearchResult | null;
  ledger: AdminSupportGrantLedgerItem[];
  reason: string;
  expiresAt: string;
  busy: boolean;
  error: string | null;
  canCreateGrant: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onSelectResult: (result: AdminSupportSearchResult) => void;
  onClubChange: (clubId: string) => void;
  onReasonChange: (value: string) => void;
  onExpiresAtChange: (value: string) => void;
  onCreateGrant: () => Promise<void>;
  onRevokeGrant: (grantId: string) => Promise<void>;
};
```

Rules:

- grant form is hidden until `selectedResult` exists;
- create button disabled unless selected result is grant eligible, club selected, reason non-blank, expiry present, and `canCreateGrant` true;
- raw UUID-only input does not appear as the primary grant control;
- errors render inline.

- [ ] Update route.

`AdminSupportRoute` owns search query state, selected result state, selected club URL state, and mutations.

Use copy:

- search heading: `지원 대상 검색`
- grant heading: `지원 접근 권한 발급`
- role denial: `현재 역할은 지원 접근 권한을 발급할 수 없습니다.`
- empty results: `검색 결과가 없습니다.`

- [ ] Add UI tests.

Assert:

- search field renders before grant form;
- grant form is absent before selection;
- selecting an eligible result reveals grant form;
- create disabled without reason;
- raw `Grantee User ID` label is absent;
- revoke button calls callback with grant id.

- [ ] Add E2E.

Mock:

- auth/me as OWNER;
- admin summary and clubs;
- support search result with masked email;
- support grants list;
- create grant response;
- revoke success.

Assert search -> select -> create -> revoke, and raw email is absent.

- [ ] Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx
pnpm --dir front exec playwright test tests/e2e/admin-support.spec.ts --project=chromium
```

Expected after implementation: pass.

## Task 16 — Release Notes, Architecture Docs, And Final Verification

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/server-state-migration.md`

- [ ] Add CHANGELOG entries only for phases that shipped.

Suggested `Unreleased` engineering bullets:

```markdown
- **platform-admin:** `/admin/notifications` is now an actionable notification/outbox operations route with masked ledgers, failure clusters, and two-step replay.
- **platform-admin:** `/admin/clubs/:id` now shows a read-mostly operations snapshot for member activity, session progress, notification health, AI usage, and readiness.
- **platform-admin:** `/admin/support` now uses search-based support grants, requiring a resolved safe result before grant creation.
```

- [ ] Update `docs/development/architecture.md` only if shipped code changes product boundaries or endpoint lists.

Add concise notes under platform admin / notification sections:

- `/admin/notifications` owns cross-club notification operations and replay;
- `/admin/clubs/:id` owns aggregate operations snapshots, not host commands;
- `/admin/support` owns support search and support grants.

- [ ] Update `docs/development/server-state-migration.md` if new platform-admin query modules ship.

Add a completed bullet for platform-admin notifications, club operations, and support workbench Query ownership.

- [ ] Run targeted checks:

```bash
git diff --check -- CHANGELOG.md docs/development/architecture.md docs/development/server-state-migration.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: no trailing whitespace and public-release scanner passes.

- [ ] Run integrated verification:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
graphify update .
git diff --check
git status --short
```

Expected: all checks pass and final status contains only intentional changed files before staging.

## Execution Notes

- Keep commits phase-local if executing manually: S5 backend, S5 frontend, S3 backend, S3 frontend, S4 backend, S4 frontend, release docs.
- Do not expose raw recipient emails, raw SMTP/provider errors, generated AI result JSON, private notes, local paths, deployment identifiers, or token-shaped examples in code fixtures or docs.
- If a verification command mutates generated artifacts, re-run the relevant targeted tests after staging the changed generated files.
- Run `graphify update .` after meaningful code changes so local graph discovery remains current.
