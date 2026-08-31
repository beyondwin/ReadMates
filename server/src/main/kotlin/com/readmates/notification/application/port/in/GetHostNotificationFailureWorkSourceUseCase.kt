@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.application.port.`in`

import java.time.OffsetDateTime
import java.util.UUID

data class HostNotificationFailureWorkSourceItem(
    val deliveryId: UUID,
    val attemptOrdinal: Int,
    val eventType: String,
    val channel: String,
    val deliveryStatus: String,
    val dueAt: OffsetDateTime,
    val resolvedAt: OffsetDateTime?,
    val safeErrorCode: String?,
)

data class HostNotificationFailureWorkSourceResult(
    val items: List<HostNotificationFailureWorkSourceItem>,
    val failureCode: String? = null,
)

fun interface GetHostNotificationFailureWorkSourceUseCase {
    fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostNotificationFailureWorkSourceResult
}
