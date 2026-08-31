package com.readmates.sessionclosing.application.service

import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.port.`in`.GetHostRecordClosingWorkSourceUseCase
import com.readmates.sessionclosing.application.port.`in`.HostRecordClosingWorkSourceItem
import com.readmates.sessionclosing.application.port.`in`.HostRecordClosingWorkSourceResult
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQuery
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryPort
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryResult
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostRecordClosingWorkSourceService(
    private val queryPort: HostRecordClosingWorkSourceQueryPort,
) : GetHostRecordClosingWorkSourceUseCase {
    override fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostRecordClosingWorkSourceResult =
        when (
            val result = queryPort.load(HostRecordClosingWorkSourceQuery(clubId, completedSince))
        ) {
            HostRecordClosingWorkSourceQueryResult.Unavailable ->
                HostRecordClosingWorkSourceResult(emptyList(), "RECORD_SOURCE_UNAVAILABLE")
            is HostRecordClosingWorkSourceQueryResult.Available ->
                HostRecordClosingWorkSourceResult(
                    result.rows
                        .filter {
                            it.primaryAction.isWorkboxAction() ||
                                (it.resolvedAt != null && !it.resolvedAt.isBefore(completedSince))
                        }.map {
                            HostRecordClosingWorkSourceItem(
                                it.sessionId,
                                it.sourceGeneration,
                                it.primaryAction.isWorkboxAction(),
                                it.dueAt,
                                it.resolvedAt,
                                it.receiptId,
                                it.receiptState,
                                it.receiptSummary,
                            )
                        },
                )
        }
}

private fun ClosingPrimaryAction.isWorkboxAction(): Boolean =
    this in
        setOf(
            ClosingPrimaryAction.CLOSE_SESSION,
            ClosingPrimaryAction.IMPORT_RECORDS,
            ClosingPrimaryAction.SEND_NOTIFICATION,
            ClosingPrimaryAction.PUBLISH_RECORDS,
        )
