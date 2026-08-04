package com.readmates.admin.operations.application.port.out

import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.util.UUID

interface LoadAdminOperationCasesPort {
    fun list(
        filter: AdminOperationCaseFilter,
        page: PageRequest,
        adminId: UUID,
    ): CursorPage<AdminOperationCase>

    fun counts(adminId: UUID): AdminOperationCaseCounts

    fun get(caseId: UUID): AdminOperationCase?

    fun history(
        caseId: UUID,
        limit: Int,
    ): List<AdminOperationCaseEvent>

    fun sourceFreshness(): List<AdminOperationSourceFreshness>
}

interface WriteAdminOperationCasesPort {
    fun reconcile(
        batch: AdminOperationSignalBatch,
        now: OffsetDateTime,
    ): List<AdminOperationCase>

    fun recordSourceFreshness(freshness: AdminOperationSourceFreshness)

    fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult
}

sealed interface AdminOperationCaseUpdateResult {
    data class Updated(
        val case: AdminOperationCase,
    ) : AdminOperationCaseUpdateResult

    data object NotFound : AdminOperationCaseUpdateResult

    data object VersionConflict : AdminOperationCaseUpdateResult
}
