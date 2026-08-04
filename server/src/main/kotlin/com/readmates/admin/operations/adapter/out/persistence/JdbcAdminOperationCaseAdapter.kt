package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationTransitionCommand
import com.readmates.admin.operations.application.port.out.LoadAdminOperationCasesPort
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcAdminOperationCaseAdapter internal constructor(
    private val reader: AdminOperationCaseJdbcReader,
    private val writer: AdminOperationCaseJdbcWriter,
) : LoadAdminOperationCasesPort,
    WriteAdminOperationCasesPort {
    override fun list(
        filter: AdminOperationCaseFilter,
        page: PageRequest,
        adminId: UUID,
    ): CursorPage<AdminOperationCase> = reader.list(filter, page, adminId)

    override fun counts(adminId: UUID): AdminOperationCaseCounts = reader.counts(adminId)

    override fun get(caseId: UUID): AdminOperationCase? = reader.get(caseId)

    override fun history(
        caseId: UUID,
        limit: Int,
    ): List<AdminOperationCaseEvent> = reader.history(caseId, limit)

    override fun sourceFreshness(): List<AdminOperationSourceFreshness> = reader.sourceFreshness()

    @Transactional
    override fun reconcile(
        batch: AdminOperationSignalBatch,
        now: OffsetDateTime,
    ): List<AdminOperationCase> = writer.reconcile(batch, now)

    @Transactional
    override fun recordSourceFreshness(freshness: AdminOperationSourceFreshness) {
        writer.recordSourceFreshness(freshness)
    }

    @Transactional
    override fun transition(command: AdminOperationTransitionCommand) = writer.transition(command)
}
