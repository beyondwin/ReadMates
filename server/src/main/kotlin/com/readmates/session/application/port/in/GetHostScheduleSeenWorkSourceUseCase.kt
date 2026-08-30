@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.application.port.`in`

import java.time.OffsetDateTime
import java.util.UUID

data class HostScheduleSeenWorkSourceItem(
    val sessionId: UUID,
    val scheduleRevision: Long,
    val unseenCount: Int,
    val dueAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val dispatchId: UUID?,
    val dispatchStatus: String?,
    val dispatchTargetCount: Int?,
    val dispatchDeliveryCount: Int?,
)

data class HostScheduleSeenWorkSourceResult(
    val items: List<HostScheduleSeenWorkSourceItem>,
    val failureCode: String? = null,
)

fun interface GetHostScheduleSeenWorkSourceUseCase {
    fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostScheduleSeenWorkSourceResult
}
