package com.readmates.sessionclosing.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class HostRecordClosingWorkSourceQuery(
    val clubId: UUID,
    val completedSince: OffsetDateTime,
)

data class HostRecordClosingWorkSourceRow(
    val sessionId: UUID,
    val sourceGeneration: String,
    val actionable: Boolean,
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
