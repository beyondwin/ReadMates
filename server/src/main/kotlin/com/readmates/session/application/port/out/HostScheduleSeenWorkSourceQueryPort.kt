package com.readmates.session.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class HostScheduleSeenWorkSourceQuery(
    val clubId: UUID,
    val evaluatedAt: OffsetDateTime,
    val completedSince: OffsetDateTime,
)

data class HostScheduleSeenWorkSourceRow(
    val sessionId: UUID,
    val scheduleRevision: Long,
    val eligibleCount: Int,
    val exactRevisionSeenCount: Int,
    val exactRevisionResolvedAt: OffsetDateTime?,
    val dueAt: OffsetDateTime,
    val dispatchId: UUID?,
    val dispatchStatus: String?,
    val dispatchTargetCount: Int?,
    val dispatchDeliveryCount: Int?,
)

sealed interface HostScheduleSeenWorkSourceQueryResult {
    data class Available(
        val rows: List<HostScheduleSeenWorkSourceRow>,
    ) : HostScheduleSeenWorkSourceQueryResult

    data object Unavailable : HostScheduleSeenWorkSourceQueryResult
}

fun interface HostScheduleSeenWorkSourceQueryPort {
    fun load(query: HostScheduleSeenWorkSourceQuery): HostScheduleSeenWorkSourceQueryResult
}
