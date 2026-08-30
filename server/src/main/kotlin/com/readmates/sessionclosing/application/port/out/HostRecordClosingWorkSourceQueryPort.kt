package com.readmates.sessionclosing.application.port.out

import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.shared.security.Sha256
import java.time.OffsetDateTime
import java.util.UUID

data class HostRecordClosingWorkSourceQuery(
    val clubId: UUID,
    val completedSince: OffsetDateTime,
)

data class HostRecordClosingVersionVector(
    val sessionRevision: Long,
    val exposureRevision: Long,
    val participantSetRevision: Long,
    val recordDraftRevision: Long?,
    val liveRecordRevision: Long?,
    val publicationRevision: Long,
    val scheduleRevision: Long,
) {
    fun sourceGeneration(sessionId: UUID): String =
        Sha256.hex(
            listOf(
                "host-record-closing-v1",
                sessionId,
                sessionRevision,
                exposureRevision,
                participantSetRevision,
                recordDraftRevision ?: "-",
                liveRecordRevision ?: "-",
                publicationRevision,
                scheduleRevision,
            ).joinToString("|"),
        )
}

data class HostRecordClosingWorkSourceRow(
    val sessionId: UUID,
    val sourceGeneration: String,
    val overallState: ClosingOverallState,
    val primaryAction: ClosingPrimaryAction,
    val dueAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val receiptId: UUID?,
    val receiptState: String?,
    val receiptSummary: String?,
)

sealed interface HostRecordClosingWorkSourceQueryResult {
    data class Available(
        val rows: List<HostRecordClosingWorkSourceRow>,
    ) : HostRecordClosingWorkSourceQueryResult

    data object Unavailable : HostRecordClosingWorkSourceQueryResult
}

fun interface HostRecordClosingWorkSourceQueryPort {
    fun load(query: HostRecordClosingWorkSourceQuery): HostRecordClosingWorkSourceQueryResult
}
