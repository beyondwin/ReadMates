package com.readmates.notification.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class HostNotificationFailureWorkSourceQuery(
    val clubId: UUID,
    val completedSince: OffsetDateTime,
)

data class HostNotificationFailureWorkSourceRow(
    val deliveryId: UUID,
    val attemptOrdinal: Int,
    val eventType: String,
    val channel: String,
    val deliveryStatus: String,
    val nextRetryAt: OffsetDateTime,
    val failureAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val safeErrorCode: String?,
)

sealed interface HostNotificationFailureWorkSourceQueryResult {
    data class Available(
        val rows: List<HostNotificationFailureWorkSourceRow>,
    ) : HostNotificationFailureWorkSourceQueryResult

    data object Unavailable : HostNotificationFailureWorkSourceQueryResult
}

fun interface HostNotificationFailureWorkSourceQueryPort {
    fun load(query: HostNotificationFailureWorkSourceQuery): HostNotificationFailureWorkSourceQueryResult
}
