package com.readmates.session.application.service

import com.readmates.session.application.port.`in`.GetHostScheduleSeenWorkSourceUseCase
import com.readmates.session.application.port.`in`.HostScheduleSeenWorkSourceItem
import com.readmates.session.application.port.`in`.HostScheduleSeenWorkSourceResult
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQuery
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryPort
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryResult
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostScheduleSeenWorkSourceService(
    private val queryPort: HostScheduleSeenWorkSourceQueryPort,
) : GetHostScheduleSeenWorkSourceUseCase {
    override fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostScheduleSeenWorkSourceResult =
        when (
            val result =
                queryPort.load(HostScheduleSeenWorkSourceQuery(clubId, evaluatedAt, completedSince))
        ) {
            HostScheduleSeenWorkSourceQueryResult.Unavailable ->
                HostScheduleSeenWorkSourceResult(emptyList(), "SCHEDULE_SOURCE_UNAVAILABLE")
            is HostScheduleSeenWorkSourceQueryResult.Available ->
                HostScheduleSeenWorkSourceResult(
                    result.rows.mapNotNull { row ->
                        val unseen =
                            (row.eligibleCount - row.exactRevisionSeenCount).coerceAtLeast(0)
                        when {
                            row.eligibleCount <= 0 -> null
                            unseen > 0 -> row.toItem(unseen, null)
                            row.exactRevisionResolvedAt != null &&
                                !row.exactRevisionResolvedAt.isBefore(completedSince) ->
                                row.toItem(0, row.exactRevisionResolvedAt)
                            else -> null
                        }
                    },
                )
        }
}

private fun com.readmates.session.application.port.out.HostScheduleSeenWorkSourceRow.toItem(
    unseen: Int,
    resolved: OffsetDateTime?,
) = HostScheduleSeenWorkSourceItem(
    sessionId,
    scheduleRevision,
    unseen,
    dueAt,
    resolved,
    dispatchId,
    dispatchStatus,
    dispatchTargetCount,
    dispatchDeliveryCount,
)
