@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.application.port.`in`

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import java.time.OffsetDateTime
import java.util.UUID

data class AdminOperationMutationCommand(
    val caseId: UUID,
    val expectedVersion: Long,
)

data class SnoozeAdminOperationCommand(
    val caseId: UUID,
    val expectedVersion: Long,
    val snoozedUntil: OffsetDateTime,
)

data class AdminOperationCaseView(
    val case: AdminOperationCase,
    val allowedActions: Set<AdminOperationAction>,
    val source: AdminOperationSourceFreshness,
)

data class AdminOperationCasePage(
    val generatedAt: OffsetDateTime,
    val counts: AdminOperationCaseCounts,
    val sources: List<AdminOperationSourceFreshness>,
    val cases: CursorPage<AdminOperationCaseView>,
)

data class AdminOperationCaseDetail(
    val case: AdminOperationCaseView,
    val history: List<AdminOperationCaseEvent>,
)

interface ListAdminOperationCasesUseCase {
    fun list(
        admin: CurrentPlatformAdmin,
        filter: AdminOperationCaseFilter,
        page: PageRequest,
    ): AdminOperationCasePage
}

interface GetAdminOperationCaseUseCase {
    fun get(
        admin: CurrentPlatformAdmin,
        caseId: UUID,
    ): AdminOperationCaseDetail
}

interface AcknowledgeAdminOperationCaseUseCase {
    fun acknowledge(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase
}

interface SnoozeAdminOperationCaseUseCase {
    fun snooze(
        admin: CurrentPlatformAdmin,
        command: SnoozeAdminOperationCommand,
    ): AdminOperationCase
}

interface ResolveAdminOperationCaseUseCase {
    fun resolve(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase
}
